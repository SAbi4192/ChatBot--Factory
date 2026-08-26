/**
 * Deterministic conversation engines (Checkpoint 8):
 *   - slot filling / multi-step forms
 *   - visual flow execution (5 node types: Message, Question, Condition, AI, Handoff)
 *
 * Both run inside the chat pipeline BEFORE the free-form AI router, so a bot
 * configured with a form or a flow answers deterministically; anything not
 * covered falls back to the LLM.
 */
import { prisma } from '../prisma.js';
import { uid } from './bot.service.js';
import { classifyIntent } from './nlu.service.js';

const STORE_MESSAGES = Symbol('persist');

// ============================================================================
// SLOT FILLING — multi-step forms
// ============================================================================

/**
 * Drive the slot-filling state machine.
 * Returns { response, persist? } — when persist is set, the exchange should
 * be written by the caller; when null, the AI router should take over.
 */
export async function runSlotEngine(bot, conversationId, userMessage, persist) {
  const slots = Array.isArray(bot.slots) && bot.slots.length ? bot.slots : null;
  if (!slots) return null;

  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  const state = conv?.slotState ?? null;

  // New conversation with a form → start collecting.
  if (!state) {
    const first = slots[0];
    const next = { step: 0, values: {}, done: false, startedAt: Date.now() };
    await prisma.conversation.update({ where: { id: conversationId }, data: { slotState: next } });
    const msg = slotPrompt(bot, first, 1, slots.length);
    await persist('assistant', msg, 'profile');
    return { response: msg, engine: 'slots' };
  }

  if (state.done) return null; // form completed → free AI

  // Awaiting confirmation: "confirm" submits, anything else re-asks.
  if (state.awaitingConfirmation) {
    if (/^confirm$/i.test(userMessage.trim())) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { slotState: { ...state, done: true, confirmedAt: Date.now() } },
      });
      const msg = `✅ **Submitted!** Your ${bot.name} form is complete — here's what we recorded:\n\n${slotSummary(bot, state.values)}`;
      await persist('assistant', msg, 'profile');
      return { response: msg, engine: 'slots' };
    }
    const msg = 'No problem — tell me the field you want to change (for example "email is wrong"), or reply **confirm** to submit.';
    await persist('assistant', msg, 'profile');
    return { response: msg, engine: 'slots' };
  }

  const field = slots[state.step];
  if (!field) {
    await prisma.conversation.update({ where: { id: conversationId }, data: { slotState: { ...state, done: true } } });
    const msg = slotSummary(bot, state.values);
    await persist('assistant', msg, 'profile');
    return { response: msg, engine: 'slots' };
  }

  // Validate + store the current field.
  const problem = validateField(field, userMessage);
  if (problem) {
    const msg = `That doesn't look like a valid ${field.label.toLowerCase()} — ${problem}`;
    await persist('assistant', msg, 'profile');
    return { response: msg, engine: 'slots' };
  }

  const values = { ...state.values, [field.name]: normalizeField(field, userMessage) };
  const step = state.step + 1;

  if (step < slots.length) {
    const nextField = slots[step];
    const next = { step, values, done: false, startedAt: state.startedAt };
    await prisma.conversation.update({ where: { id: conversationId }, data: { slotState: next } });
    const msg = slotPrompt(bot, nextField, step + 1, slots.length);
    await persist('assistant', msg, 'profile');
    return { response: msg, engine: 'slots' };
  }

  // All fields collected → ask for confirmation.
  const next = { step, values, done: false, awaitingConfirmation: true, startedAt: state.startedAt };
  await prisma.conversation.update({ where: { id: conversationId }, data: { slotState: next } });
  const msg = `${slotSummary(bot, values)}\n\nReply **confirm** to submit, or tell me what to change.`;
  await persist('assistant', msg, 'profile');
  return { response: msg, engine: 'slots' };
}

function slotPrompt(bot, field, idx, total) {
  const required = field.required === false ? ' (optional)' : '';
  const hint = field.hint ? `\n_${field.hint}_` : '';
  return `📋 **${bot.name}** — form step ${idx}/${total}\n\nPlease provide your **${field.label}**${required}:${hint}`;
}

function slotSummary(bot, values) {
  const lines = Object.entries(values)
    .map(([k, v]) => `- **${k.replace(/_/g, ' ')}**: ${v}`)
    .join('\n');
  return `📋 **${bot.name}** — please confirm:\n\n${lines}`;
}

function validateField(field, value) {
  const v = value.trim();
  if (!v && field.required !== false) return 'this field is required.';
  if (field.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'please enter a valid email.';
  if (field.type === 'phone' && v && !/^\+?[\d\s-]{7,}$/.test(v)) return 'please enter a valid phone number.';
  if (field.type === 'number' && v && !/^-?\d+(\.\d+)?$/.test(v)) return 'please enter a number.';
  if (field.type === 'date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'please use YYYY-MM-DD format.';
  if (field.min != null && v && Number(v) < field.min) return `the minimum is ${field.min}.`;
  if (field.max != null && v && Number(v) > field.max) return `the maximum is ${field.max}.`;
  if (field.options && !field.options.some((o) => o.toLowerCase() === v.toLowerCase())) {
    return `please choose from: ${field.options.join(', ')}.`;
  }
  return null;
}

function normalizeField(field, value) {
  const v = value.trim();
  if (field.type === 'number') return Number(v);
  return v;
}

// ============================================================================
// FLOW ENGINE — visual conversation flows (5 node types)
// ============================================================================

const FLOW_NODE_TYPES = new Set(['message', 'question', 'condition', 'ai', 'handoff']);

/**
 * Execute a bot's flow graph against the user message.
 * Returns { response, engine } or null to fall back to the AI router.
 */
export async function runFlowEngine(bot, conversationId, userMessage, history, persist) {
  const flow = bot.flow;
  if (!flow?.nodes?.length) return null;

  const nodes = new Map(flow.nodes.map((n) => [n.id, n]));
  const byType = new Map();
  for (const n of flow.nodes) byType.set(n.id, n);
  const start = flow.nodes.find((n) => n.type === 'start' || n.data?.start);
  if (!start) return null;

  // Walk the graph from the start node.
  let current = start;
  let steps = 0;
  const responses = [];

  while (current && steps < 20) {
    steps++;
    const { type, data = {} } = current;

    if (type === 'start') {
      const next = nextNode(flow, current.id);
      if (!next) break;
      current = nodes.get(next);
      continue;
    }

    if (type === 'message') {
      const text = data.text || '';
      if (text) {
        await persist('assistant', text, 'profile');
        responses.push(text);
      }
      const next = nextNode(flow, current.id);
      current = next ? nodes.get(next) : null;
      continue;
    }

    if (type === 'question') {
      const text = data.text || '';
      if (text) {
        await persist('assistant', text, 'profile');
        responses.push(text);
      }
      // Stay on this node until the user picks an option or the AI answers.
      const options = data.options || [];
      if (options.length && options.some((o) => userMessage.toLowerCase().includes(o.toLowerCase()))) {
        const picked = options.find((o) => userMessage.toLowerCase().includes(o.toLowerCase()));
        const branch = data.branches?.[picked] || edgeTarget(flow, current.id);
        current = branch ? nodes.get(branch) : null;
        continue;
      }
      // No option matched — fall through to free AI if this is a dead end.
      return responses.length ? { response: responses.join('\n\n'), engine: 'flow' } : null;
    }

    if (type === 'condition') {
      const intent = classifyIntent(userMessage);
      const branch = data.branches?.[intent] || data.branches?.default || edgeTarget(flow, current.id);
      current = branch ? nodes.get(branch) : null;
      continue;
    }

    if (type === 'ai') {
      // Free-form AI node — the router takes over for this turn.
      return responses.length ? { response: responses.join('\n\n'), engine: 'flow' } : null;
    }

    if (type === 'handoff') {
      const msg = 'Let me connect you with a human agent who can help further.';
      await persist('assistant', msg, 'profile');
      responses.push(msg);
      return { response: msg, engine: 'flow', handoff: true };
    }

    break;
  }

  return responses.length ? { response: responses.join('\n\n'), engine: 'flow' } : null;
}

function nextNode(flow, id) {
  return edgeTarget(flow, id);
}

function edgeTarget(flow, sourceId) {
  const edge = flow.edges?.find((e) => e.source === sourceId);
  return edge?.target ?? null;
}

/** Validate a flow definition before saving. */
export function validateFlow(flow) {
  if (!flow || !Array.isArray(flow.nodes)) return { ok: false, error: 'Flow must have nodes' };
  for (const n of flow.nodes) {
    if (!FLOW_NODE_TYPES.has(n.type) && n.type !== 'start') {
      return { ok: false, error: `Unknown node type "${n.type}"` };
    }
  }
  return { ok: true };
}
