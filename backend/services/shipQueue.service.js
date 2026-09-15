/**
 * shipQueue.service — the background ship pipeline engine.
 *
 * Why this exists: GitHub + Render enforce write-rate limits. A per-request
 * UI hits those ceilings and screams "wait a minute and retry". Instead the
 * whole factory feeds ONE in-process queue: the engine pulls jobs
 * continuously, self-paces with the global Render write budget (every
 * mutating call inside render.service waits for budget automatically),
 * retries transient failures with backoff, and NEVER surfaces a rate-limit
 * error to the user — it just waits, then goes. 50 bots enqueue in one
 * click and drain as fast as upstream limits allow.
 *
 * Per-bot stages:
 *   queued -> github (export bundle, create repo, push)
 *          -> render (create service; Render auto-starts the first deploy —
 *             no extra triggerDeploy call = fewer writes, faster drains)
 *          -> watching (batch status until live / failed; failures re-queue)
 *          -> done
 *
 * The user's Gemini key for each bot lives ONLY in memory (pendingKeys) and
 * in the Deploy env injection — it is never written to a repo. After use we
 * drop it from memory.
 */
import { randomBytes } from 'node:crypto';
import db from '../db.js';
import * as github from './github.service.js';
import * as render from './render.service.js';
import { buildBotBundle, repoNameFor } from './export.service.js';
import { logActivity } from './audit.service.js';

const TICK_MS = 3000;          // engine heartbeat
const GH_CONCURRENCY = 4;      // repos can push in parallel (no tight GitHub limit)
const RENDER_CONCURRENCY = 2;  // service creates paced by render.service write budget
const MAX_ATTEMPTS = 5;        // retries per stage before a job goes back to queued for user retry
const WATCH_POLL_MS = 6000;    // how often a watcher asks Render for deploy status
const WATCH_TIMEOUT_MS = 30 * 60_000; // stop watching (leave status to UI poll) after 30 min

/** botId -> { key, provider, jobId } — ephemeral, memory only. */
const pendingKeys = new Map();
const KEY_TTL_MS = 3 * 60 * 60_000;

/** Active jobs, keyed by botId. */
const jobs = new Map();
let cursor = null; // job id currently executing (single-writer discipline per job)
let timer = null;

/* ------------------------------------------------------------------ job API */

/**
 * Enqueue bots for a full ship. `keys` maps botId -> Gemini key (optional).
 * Returns { accepted, skipped, queueToken }.
 */
export function enqueue({ orgId, userId, userEmail, botIds, keys = {}, mode = 'github+render' }) {
  const accepted = [];
  const skipped = [];
  const list = Array.from(new Set(botIds)).slice(0, 100);

  for (const botId of list) {
    const existing = jobs.get(botId);
    if (existing && (existing.stage !== 'done' || existing.status === 'working')) {
      skipped.push({ botId, reason: 'already in the ship queue' });
      continue;
    }
    const key = String(keys[botId] || '').trim();
    const job = {
      botId, orgId, userId, userEmail, mode,
      stage: 'queued', status: 'waiting', attempts: 0,
      message: 'Waiting in ship queue',
      enqueuedAt: Date.now(), updatedAt: Date.now(),
      name: null, repoUrl: null, deployUrl: null, deployStatus: null,
      watcher: false, lastError: null,
    };
    jobs.set(botId, job);
    if (key) pendingKeys.set(botId, { key, jobId: botId, at: Date.now() });
    accepted.push(botId);
  }
  wake();
  return { accepted, skipped, queueToken: randomBytes(6).toString('hex') };
}

/** Snapshot for the UI (progress bar + per-row text). */
export function queueStatus() {
  const out = { total: 0, working: 0, waiting: 0, done: 0, failed: 0, renderBudget: render.renderWriteLoad?.() || null, jobs: [] };
  for (const j of jobs.values()) {
    out.total += 1;
    if (j.status === 'working') out.working += 1;
    else if (j.status === 'waiting') out.waiting += 1;
    else if (j.status === 'done') out.done += 1;
    else if (j.status === 'failed') out.failed += 1;
    out.jobs.push({
      botId: j.botId, orgId: j.orgId, name: j.name, stage: j.stage, status: j.status,
      message: j.message, attempts: j.attempts, updatedAt: j.updatedAt,
    });
  }
  return out;
}

/** Pull a job out of the queue (used when the user deletes a bot). */
export function dequeue(botId) {
  jobs.delete(botId);
  pendingKeys.delete(botId);
  wake();
}

/**
 * Enqueue a full cloud teardown (GitHub repo + Render service) per bot.
 * Same self-pacing engine — deleting 30 services never hits a write-limit popup.
 */
export function enqueueDelete({ orgId, botIds }) {
  const accepted = [];
  for (const botId of Array.from(new Set(botIds)).slice(0, 100)) {
    if (jobs.has(botId) && jobs.get(botId).stage === 'delete') continue;
    jobs.set(botId, {
      botId, orgId, userId: null, userEmail: 'system', mode: 'delete',
      stage: 'delete', status: 'waiting', attempts: 0, message: 'Queued for deletion…',
      enqueuedAt: Date.now(), updatedAt: Date.now(), name: null, watcher: false,
    });
    accepted.push(botId);
  }
  wake();
  return { accepted: accepted.length };
}

/* --------------------------------------------------------------- stage work */

function ghParts(state) {
  if (state?.repoName && state.repoName.includes('/')) {
    const [owner, repo] = state.repoName.split('/');
    if (owner && repo) return { owner, repo };
  }
  const m = String(state?.repoUrl || '').match(/github\.com\/([^/]+)\/([^/#?]+)/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const patch = (job, data) => db.updateBotShip(job.botId, job.orgId, data).catch(() => {});

function setStage(job, stage, status, message) {
  if (status === 'working' || stage === 'done') job.nextTry = 0;
  job.stage = stage; job.status = status; job.message = message; job.updatedAt = Date.now();
  patch(job, { shipStage: stage });
}

async function doGithub(job) {
  const bot = await db.getBot(job.botId, job.orgId);
  if (!bot) throw new Error('bot not found');
  job.name = bot.name;
  setStage(job, 'github', 'working', 'Pushing repo to GitHub…');

  const bundle = buildBotBundle(bot);
  const domainLine = [bot.domain, bot.subdomain].filter(Boolean).join(' · ');
  const { owner, repo, url } = await github.ensureRepo({
    name: repoNameFor(bot),
    description: `${bot.name} — ${domainLine} chatbot generated by Scarlet Chatbot Factory`,
  });
  await github.pushRepoFiles({ owner, repo }, bundle);

  await db.updateBotShip(job.botId, job.orgId, {
    repoUrl: url, repoName: `${owner}/${repo}`, shippedAt: new Date(), shipStage: 'github',
  });
  job.repoUrl = url;
  await logActivity({
    orgId: job.orgId, actorId: job.userId, actorName: job.userEmail,
    eventType: 'bot.shipped_github', data: { repo: `${owner}/${repo}`, via: 'queue' }, botId: job.botId,
  }).catch(() => {});
  return job.mode === 'github' ? 'Repo ready on GitHub' : 'GitHub ✓';
}

async function doRender(job) {
  const state = await db.getBotShipState(job.botId, job.orgId);
  if (!state?.repoUrl) throw new Error('needs GitHub first');

  // Key priority: ephemeral in-memory (user typed at Deploy) -> DB per-bot key -> factory .env
  const held = pendingKeys.get(job.botId);
  const geminiKey = (held && String(held.key)) || state.llmApiKey || process.env.GEMINI_API_KEY;
  if (!geminiKey || String(geminiKey).startsWith('your_')) {
    // Not an error popup — park the job (30s backoff loop) until a key exists.
    job.nextTry = Date.now() + 30_000;
    setStage(job, 'render', 'waiting', 'Waiting for API key…');
    return null;
  }

  job.name = job.name || (await db.getBot(job.botId, job.orgId))?.name;
  const baseName = render.renderName((state.repoName || repoNameFor({ id: job.botId, subdomain: job.name || 'bot' })).replace('/', '-'), job.botId);

  if (state.renderServiceId && state.deployUrl) {
    // Re-deploy existing service (resume first if it slept).
    setStage(job, 'render', 'working', 'Redeploying on Render…');
    await render.resumeService(state.renderServiceId).catch(() => {});
    await render.triggerDeploy(state.renderServiceId);
    pendingKeys.delete(job.botId);
    await db.updateBotShip(job.botId, job.orgId, { deployStatus: 'queued', shipStage: 'watch' });
    job.deployUrl = state.deployUrl;
    return 'Redeploy queued ✓';
  }

  setStage(job, 'render', 'working', 'Deploying on Render…');
  let service = null;
  for (const candidate of [baseName, `${baseName}-${Math.random().toString(36).slice(2, 5)}`]) {
    try {
      service = await render.createWebService({ name: candidate, repoUrl: state.repoUrl, geminiKey });
      break;
    } catch (err) {
      if (err.message === 'render_name_taken') continue;
      throw err;
    }
  }
  if (!service) throw new Error('Render could not allocate a unique service name');

  // NOTE: create already starts the first deploy (Render API behaviour) —
  // no extra triggerDeploy write, faster drains.
  pendingKeys.delete(job.botId);
  await db.updateBotShip(job.botId, job.orgId, {
    renderServiceId: service.id, deployUrl: service.url, deployStatus: 'building', shipStage: 'watch',
  });
  await logActivity({
    orgId: job.orgId, actorId: job.userId, actorName: job.userEmail,
    eventType: 'bot.shipped_render', data: { service: service.id, url: service.url, via: 'queue' }, botId: job.botId,
  }).catch(() => {});
  job.deployUrl = service.url;
  return 'Service created ✓';
}

/** Remove the bot from GitHub + Render (idempotent: already-gone = done). */
async function doDelete(job) {
  const state = await db.getBotShipState(job.botId, job.orgId);
  const parts = ghParts(state);
  if (!state?.renderServiceId && !parts) {
    // nothing published — just clear local bookkeeping and finish
    await db.clearBotShip(job.botId, job.orgId).catch(() => {});
    return true;
  }
  setStage(job, 'delete', 'working', 'Removing from GitHub + Render…');
  await db.updateBotShip(job.botId, job.orgId, { shipStage: 'deleting' }).catch(() => {});
  if (state.renderServiceId) {
    try { await render.deleteService(state.renderServiceId); }
    catch (err) {
      if (err.code === 'render_cap' || /not found/i.test(err.message || '')) { /* gone already */ }
      else throw err;
    }
  }
  if (parts) await github.deleteRepo(parts.owner, parts.repo);
  await db.clearBotShip(job.botId, job.orgId);
  await logActivity({
    orgId: job.orgId, actorId: job.userId, actorName: job.userEmail,
    eventType: 'bot.unpublished', data: { repo: state.repoName || null, via: 'queue' }, botId: job.botId,
  }).catch(() => {});
  return true;
}

/* -------------------------------------------------------------- the engine */

async function runJob(job) {
  try {
    if (job.stage === 'queued' || job.stage === 'github') {
      job.stage = 'github';
      const msg = await doGithub(job);
      if (job.mode === 'github') { finish(job, msg); return; }
      job.nextTry = Date.now() + 1500; // let the watch/gh slots settle
      setStage(job, 'render', 'waiting', msg || 'GitHub ✓');
      wake(); // hand straight to the render lane
      return;
    }
    if (job.stage === 'render') {
      const msg = await doRender(job);
      if (msg === null) return; // waiting for key
      setStage(job, 'watch', 'waiting', msg || 'Deploying…'); // watcher owns it from here
      startWatcher(job);
      return;
    }
    if (job.stage === 'delete') {
      const ok = await doDelete(job);
      if (ok) finish(job, 'Removed from GitHub + Render ✓');
      return;
    }
    if (job.stage === 'watch') {
      // watcher already runs; nothing for the tick loop to do
      startWatcher(job);
      return;
    }
    finish(job, job.message);
  } catch (err) {
    // Render account capacity cap: never a popup, never a burned attempt.
    // Park quietly, re-check every 2 min — the moment a slot frees up the
    // queued deploy sails through on its own.
    if (err?.code === 'render_cap') {
      job.capTries = (job.capTries || 0) + 1;
      if (job.capTries > 90) { // ~3h patience then honest fail
        setStage(job, job.stage, 'failed', 'Render is full right now — delete an old bot service and press Deploy again.');
      } else {
        job.nextTry = Date.now() + 120_000;
        setStage(job, job.stage, 'waiting', 'Waiting for space on Render — continuing automatically…');
      }
      wake();
      return;
    }
    job.attempts += 1;
    job.lastError = err?.message || String(err);
    if (job.attempts >= MAX_ATTEMPTS) {
      setStage(job, job.stage, 'failed', `Stuck after ${job.attempts} tries — ${job.lastError}`);
      await patch(job, { shipStage: 'failed' });
    } else {
      const back = Math.min(60_000, 4_000 * 2 ** job.attempts);
      job.nextTry = Date.now() + back;
      setStage(job, job.stage, 'waiting', `Retry ${job.attempts}/${MAX_ATTEMPTS} in ${Math.round(back / 1000)}s — ${job.lastError}`);
      await wakeAfter(back);
    }
  }
}

function finish(job, msg) {
  setStage(job, 'done', 'done', msg || 'Done');
  patch(job, { shipStage: 'done' });
  // linger visible so the progress bar counts it, then drop
  setTimeout(() => { if (jobs.get(job.botId) === job) jobs.delete(job.botId); wake(); }, 25_000).unref?.();
}

function startWatcher(job) {
  if (job.watcher) return;
  job.watcher = true;
  const since = Date.now();
  const poll = async () => {
    // job may have been removed (delete) — stop quietly
    if (jobs.get(job.botId) !== job) { job.watcher = false; return; }
    try {
      const state = await db.getBotShipState(job.botId, job.orgId);
      if (state?.renderServiceId) {
        const { deployStatus } = await render.latestDeployStatus(state.renderServiceId);
        if (deployStatus !== state.deployStatus) {
          await db.updateBotShip(job.botId, job.orgId, { deployStatus }).catch(() => {});
        }
        if (deployStatus === 'live') {
          setStage(job, 'done', 'done', `Live ✓ ${state.deployUrl || ''}`.trim());
          job.watcher = false;
          setTimeout(() => { if (jobs.get(job.botId) === job) jobs.delete(job.botId); wake(); }, 25_000).unref?.();
          return;
        }
        if (deployStatus === 'deploy_failed') {
          job.watcher = false;
          if (job.attempts < MAX_ATTEMPTS) {
            job.attempts += 1;
            setStage(job, 'render', 'waiting', `Deploy failed — retrying (${job.attempts}/${MAX_ATTEMPTS})…`);
          } else {
            setStage(job, 'done', 'failed', 'Deploy failed on Render — open the service log');
            setTimeout(() => { if (jobs.get(job.botId) === job) jobs.delete(job.botId); wake(); }, 30_000).unref?.();
          }
          wake();
          return;
        }
        job.message = deployStatus === 'suspended' ? 'Getting the build going again…' : 'Building on Render…';
        job.updatedAt = Date.now();
        if (job.message.includes('paused')) {
          await render.resumeService(state.renderServiceId).catch(() => {});
        }
      }
    } catch { /* transient — next poll continues */ }
    if (Date.now() - since > WATCH_TIMEOUT_MS) {
      setStage(job, 'watch', 'done', 'Still building on Render — check the live badge');
      jobs.delete(job.botId);
      job.watcher = false;
      wake();
      return;
    }
    setTimeout(poll, WATCH_POLL_MS).unref?.();
  };
  setTimeout(poll, 2500).unref?.();
}

/* ------------------------------------------------------------- loop control */

function runnableJobs() {
  const now = Date.now();
  let ghBusy = [...jobs.values()].filter((j) => j.status === 'working' && (j.stage === 'github' || j.stage === 'queued')).length;
  let rdBusy = [...jobs.values()].filter((j) => j.status === 'working' && j.stage === 'render').length;
  let delBusy = [...jobs.values()].filter((j) => j.status === 'working' && j.stage === 'delete').length;
  const out = [];
  for (const j of jobs.values()) {
    if (j.status !== 'waiting') continue;
    if (j.nextTry && j.nextTry > now) continue; // backing off — not due yet
    if ((j.stage === 'queued' || j.stage === 'github') && ghBusy < GH_CONCURRENCY) { out.push(j); ghBusy += 1; }
    else if (j.stage === 'render' && rdBusy < RENDER_CONCURRENCY) { out.push(j); rdBusy += 1; }
    else if (j.stage === 'watch') { out.push(j); } // cheap — guarded by job.watcher
    else if (j.stage === 'delete' && delBusy < 4) { out.push(j); delBusy += 1; }
  }
  return out;
}

async function tick() {
  // watchdog: a job left 'working' with no runner (stage hand-off) goes back to waiting
  for (const j of jobs.values()) {
    if (j.status === 'working' && !j.watcher && Date.now() - (j.updatedAt || 0) > 20_000) {
      j.status = 'waiting';
    }
  }
  const due = runnableJobs();
  for (const job of due) {
    job.status = 'working';
    job.startedAt = job.startedAt || Date.now();
    runJob(job).finally(() => wake());
  }
  scheduleTick();
}

function scheduleTick() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, TICK_MS);
  timer.unref?.();
}

async function wakeAfter(ms) {
  setTimeout(() => { wake(); }, ms).unref?.();
}

function wake() {
  if (timer) { clearTimeout(timer); timer = null; }
  tick();
}

/** Called once at server boot: pick up ships that were in-flight pre-restart. */
export function resumePersistedQueues() {
  return db.getResumableShipBots().then((bots) => {
    let found = 0;
    for (const b of bots) {
      const stage = b.shipStage;
      if (jobs.has(b.id)) continue;
      const base = {
        botId: b.id, orgId: b.orgId, userId: null, userEmail: 'system', mode: 'github+render',
        attempts: 0, enqueuedAt: Date.now(), updatedAt: Date.now(), name: b.name,
        deployUrl: b.deployUrl || null, repoUrl: b.repoUrl || null, watcher: false, lastError: null,
      };
      if (stage === 'delete' || stage === 'deleting') {
        // a teardown that was mid-flight — resume the deletion, never the deploy
        jobs.set(b.id, { ...base, mode: 'delete', stage: 'delete', status: 'waiting', message: 'Resuming delete…' });
        found += 1;
      } else if ((stage === 'github' || stage === 'failed') && !b.repoUrl) {
        jobs.set(b.id, { ...base, stage: 'queued', status: 'waiting', message: 'Resumed after restart' });
        found += 1;
      } else if (stage === 'render' && b.repoUrl && !b.renderServiceId) {
        jobs.set(b.id, { ...base, stage: 'render', status: 'waiting', message: 'Deploy pending — resuming' });
        if (b.llmApiKey) pendingKeys.set(b.id, { key: b.llmApiKey, jobId: b.id, at: Date.now() });
        found += 1;
      } else if (stage === 'watch' && b.renderServiceId) {
        jobs.set(b.id, { ...base, stage: 'watch', status: 'waiting', message: 'Watching build…' });
        if (b.llmApiKey) pendingKeys.set(b.id, { key: b.llmApiKey, jobId: b.id, at: Date.now() });
        found += 1;
      } else {
        // stage says queued/github but repo exists & render pending — continue pipeline
        jobs.set(b.id, { ...base, stage: 'render', status: 'waiting', message: 'Deploy pending' });
        if (b.llmApiKey) pendingKeys.set(b.id, { key: b.llmApiKey, jobId: b.id, at: Date.now() });
        found += 1;
      }
    }
    if (found) { console.log(`[ship-queue] resumed ${found} job(s) from DB`); wake(); }
  }).catch(() => {});
}

// purge stale in-memory keys
setInterval(() => {
  const cutoff = Date.now() - KEY_TTL_MS;
  for (const [id, v] of pendingKeys) if (v.at < cutoff) pendingKeys.delete(id);
}, 10 * 60 * 1000).unref?.();

scheduleTick();
