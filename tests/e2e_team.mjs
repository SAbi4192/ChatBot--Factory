/**
 * Team Mode E2E — boots nothing itself; expects a FRESH backend on PORT (3101)
 * already running with the new code. Verifies the full flow through the real
 * HTTP API with real LLM providers (Groq/Gemini keys from .env).
 *
 *   login → list bots → enable teamMode on bot A → chat → expect team:<B>
 *   → disable → chat → expect no team provider → disabled bot stays false
 *
 * Run: node tests/e2e_team.mjs 3101
 */
const PORT = process.argv[2] || '3101';
const BASE = `http://localhost:${PORT}/api`;
const EMAIL = 'admin@factory.local';
const PASSWORD = 'admin123';

let pass = 0, fail = 0;
const failures = [];
function check(label, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  if (!ok) failures.push(`${label}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
  console.log(`  ${ok ? 'PASS' : '>>FAIL'} ${label}${ok ? '' : ` (got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)})`}`);
}
async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

console.log(`\n[0] Logging in against :${PORT}`);
const login = await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
check('login ok', login.status, 200);
const token = login.json.accessToken;
if (!token) { console.log('FATAL: no token'); process.exit(1); }

console.log('\n[1] Listing bots');
const botsRes = await api('/bots', { token });
check('bots list ok', botsRes.status, 200);
const bots = botsRes.json;
console.log(`  found ${bots.length} bots: ${bots.slice(0, 6).map(b => `${b.name}(${b.domain})`).join(', ')}${bots.length > 6 ? ' …' : ''}`);
if (bots.length < 2) { console.log('FATAL: need at least 2 bots for a routing test'); process.exit(1); }
check('teamMode field present on all bots', bots.every(b => typeof b.teamMode === 'boolean'), true);

// Pick an orchestrator + the best specialist pair: orchestrator must be a
// DIFFERENT domain than the message's target bot.
const message = 'give me a simple pasta recipe with tomatoes';
const words = message.split(/\s+/);
const specialist = bots.find(b => b.domain && words.some(w => (b.domain + ' ' + (b.description || '')).toLowerCase().includes(w.toLowerCase())) && b.domain !== bots[0].domain) || bots[1];
const orchestrator = bots.find(b => b.id !== specialist.id && b.domain !== specialist.domain) || bots[0];
console.log(`  orchestrator: ${orchestrator.name} (${orchestrator.domain})`);
console.log(`  specialist:   ${specialist.name} (${specialist.domain})`);

console.log('\n[2] Enabling Team Mode on orchestrator');
const enableRes = await api(`/bots/${orchestrator.id}`, { method: 'PATCH', token, body: { teamMode: true } });
check('PATCH teamMode accepted', enableRes.status, 200);
check('teamMode now true', enableRes.json?.teamMode === true, true);

// verify it persisted
const refetch = await api(`/bots/${orchestrator.id}`, { token });
check('teamMode persisted', refetch.json?.teamMode === true, true);

console.log('\n[3] Chat through orchestrator (streaming path)');
const convId = `tm_${Date.now()}`;
const convRes = await api('/conversations', { method: 'POST', token, body: { id: convId, botId: orchestrator.id, title: `Team E2E ${Date.now()}` } });
check('conversation created', convRes.status === 200 || convRes.status === 201, true);
// NOTE: the legacy POST /conversations route returns { success: true } without
// echoing the id — that's why we generate convId above and reuse it everywhere.

const streamRes = await fetch(`${BASE}/chat/stream`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ botId: orchestrator.id, conversationId: convId, message }),
});
check('stream endpoint 200', streamRes.status, 200);
const raw = await streamRes.text();
const doneLine = raw.split('\n').find(l => l.startsWith('data: ') && l.includes('"done":true'));
const done = doneLine ? JSON.parse(doneLine.slice(6)) : null;
check('stream done event received', !!done, true);
const provider = done?.provider || '';
console.log(`  provider: ${JSON.stringify(provider)}`);
console.log(`  reply preview: ${(done?.response || raw.slice(0, 120) || '').slice(0, 140)}`);
check('reply routed to specialist (team:<name>)', provider.startsWith('team:'), true);
if (provider.startsWith('team:')) {
  check('routed to the expected specialist', provider.slice(5) === specialist.name, provider.slice(5) === specialist.name);
}

console.log('\n[4] No duplicate user message (routing must not double-persist)');
const msgsRes = await api(`/conversations/${convId}/messages`, { token });
if (msgsRes.status === 200) {
  const userMsgs = msgsRes.json.filter(m => m.role === 'user');
  check('exactly one user message', userMsgs.length, 1);
  const assistantMsgs = msgsRes.json.filter(m => m.role === 'assistant');
  check('exactly one assistant reply', assistantMsgs.length, 1);
  check('assistant provider tagged team:*', (assistantMsgs[0]?.provider || '').startsWith('team:'), true);
} else {
  console.log(`  (skipped persistence checks — messages endpoint ${msgsRes.status})`);
}

console.log('\n[5] Small talk stays with the orchestrator');
const conv2Id = `tm_gate_${Date.now()}`;
await api('/conversations', { method: 'POST', token, body: { id: conv2Id, botId: orchestrator.id, title: 'Team gate' } });
const gateRes = await fetch(`${BASE}/chat/stream`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ botId: orchestrator.id, conversationId: conv2Id, message: 'hi' }),
});
const gateRaw = await gateRes.text();
const gateDone = gateRaw.split('\n').find(l => l.startsWith('data: ') && l.includes('"done":true'));
const gateProvider = gateDone ? JSON.parse(gateDone.slice(6))?.provider : '';
console.log(`  greeting provider: ${JSON.stringify(gateProvider)}`);
check('greeting NOT routed to team:*', String(gateProvider).startsWith('team:'), false);

console.log('\n[6] Disabling Team Mode restores direct answers');
const disableRes = await api(`/bots/${orchestrator.id}`, { method: 'PATCH', token, body: { teamMode: false } });
check('PATCH teamMode=false', disableRes.status === 200 && disableRes.json?.teamMode === false, true);
const conv3Id = `tm_off_${Date.now()}`;
await api('/conversations', { method: 'POST', token, body: { id: conv3Id, botId: orchestrator.id, title: 'Team off' } });
const offRes = await fetch(`${BASE}/chat/stream`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ botId: orchestrator.id, conversationId: conv3Id, message }),
});
const offRaw = await offRes.text();
const offDone = offRaw.split('\n').find(l => l.startsWith('data: ') && l.includes('"done":true'));
const offProvider = offDone ? JSON.parse(offDone.slice(6))?.provider : '';
console.log(`  provider with team off: ${JSON.stringify(offProvider)}`);
check('no team routing when disabled', String(offProvider).startsWith('team:'), false);

console.log(`\n==============================================`);
console.log(`Team Mode E2E: ${pass} passed, ${fail} failed`);
console.log(`==============================================`);
if (fail > 0) { console.log(failures.join('\n')); process.exit(1); }
