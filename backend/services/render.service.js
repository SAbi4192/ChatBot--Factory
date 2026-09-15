/**
 * Render shipping — creates a free web service per bot pointing at its
 * GitHub repo, triggers deploys, maps deploy status, and supports the
 * sleep/wake discipline that keeps the account inside 750 free hours.
 *
 * Auth: RENDER_API_KEY (+ RENDER_OWNER_ID from GET /v1/owners). The service
 * creation response shape is normalized defensively.
 */
import { ApiError } from '../middleware/errorHandler.js';

const R_API = 'https://api.render.com/v1';

function creds() {
  const key = process.env.RENDER_API_KEY;
  if (!key) {
    throw new ApiError(503, 'Render is not configured — add RENDER_API_KEY (and RENDER_OWNER_ID) to the Factory .env file.');
  }
  return { key, ownerId: String(process.env.RENDER_OWNER_ID || '').trim() };
}

async function rr(path, { method = 'GET', body } = {}) {
  const { key } = creds();
  const url = new URL(`${R_API}${path}`);
  const res = await fetch(url, {
    method,
    headers: {
      // Bearer auth is accepted account-wide; the x-api-key form is deprecated
      // on this gateway. (ownerId query params are rejected 400 — omitted.)
      Authorization: `Bearer ${key}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(json) ? '' : String(json?.message || json?.detail || '').slice(0, 120);
    const err = new Error(`render_call_failed_${path.split('?')[0]}_${res.status}${detail ? ' ' + detail : ''}`);
    err.status = res.status;
    err.renderBody = json;
    // Render tells EXACTLY when its write window resets — we obey that number
    // instead of guessing, so queued ships resume the second Render allows them.
    const ra = Number(res.headers.get('retry-after') || res.headers.get('ratelimit-reset') || 0);
    if (Number.isFinite(ra) && ra > 0) err.retryAfter = ra; // seconds
    throw err;
  }
  return json;
}

function translate(err, message) {
  if (err instanceof ApiError) return err;
  const bodyMsg = String(err.renderBody?.message || err.renderBody?.detail || err.message || '');
  if (/tier is limited|limited to \d+ services|maximum (number of )?services|plan limit|service limit/i.test(bodyMsg)) {
    // account/PLAN resource cap (e.g. "Hobby Tier is limited to 25 services") —
    // NOT a rate limit. Status varies (400/403/422), so detect by text. The
    // queue parks these as "waiting for a slot" instead of burning retries.
    const cap = new ApiError(403, 'The deploy line is full right now — new bots go live as space frees up.');
    cap.code = 'render_cap';
    return cap;
  }
  if (err.status === 401 || err.status === 403) return new ApiError(503, 'Render rejected the API key — check RENDER_API_KEY in .env.');
  if (err.status === 429) return new ApiError(503, 'Render is cooling down new deploys — queued ships resume automatically in a little while.');
  if (err.status === 404) return new ApiError(502, 'Render could not find that service — it may have been deleted; re-ship it from the Factory.');
  return new ApiError(502, message);
}

/**
 * Render throttles API writes hard; transient 429/5xx should not surface to
 * the user during normal ship flows. Retry a couple of times with backoff.
 */
async function withThrottleRetry(action, { attempts = 3, ms = 45_000 } = {}) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try { return await action(); } catch (err) {
      last = err;
      const throttled = err.status === 429 || err.status >= 500;
      if (!throttled || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, ms));
    }
  }
  throw last;
}


/**
 * ---- GLOBAL RENDER WRITE BUDGET ------------------------------------------------
 * Render account writes (create / deploy / suspend / resume / delete) are capped
 * at roughly 20 ops per few minutes. Rather than surfacing that as a user-facing
 * error, EVERY mutating call below first passes through a sliding-window budget:
 * ops faster than the budget simply WAIT in line inside the server. If Render
 * still says "write limit" (429, or 403 whose message mentions it), the window
 * parks itself for ~70s and the op auto-retries — invisible to the UI.
 */
const WRITE_WINDOW_MS = 60_000;
const WRITE_BUDGET = Number(process.env.RENDER_WRITE_BUDGET || 16); // stay under Render's ~20
const writeStamps = [];
let pauseUntil = 0;

async function acquireRenderWrite() {
  for (;;) {
    const now = Date.now();
    if (now < pauseUntil) { await new Promise((r) => setTimeout(r, pauseUntil - now + 50)); continue; }
    while (writeStamps.length && now - writeStamps[0] > WRITE_WINDOW_MS) writeStamps.shift();
    if (writeStamps.length < WRITE_BUDGET) { writeStamps.push(now); return; }
    // Window full → sleep exactly until the oldest write ages out. Queue drains itself.
    await new Promise((r) => setTimeout(r, writeStamps[0] + WRITE_WINDOW_MS - now + 120));
  }
}

/** Budget-gated + write-limit-aware retry for every mutating Render call. */
/**
 * Budget-gated + write-limit-aware executor for EVERY mutating Render call.
 * - waits for the sliding write budget before each attempt
 * - 429 / "write limit" 403s are NEVER surfaced: the whole fleet parks until
 *   Render's own `retry-after` says the window reset, then silently continues
 * - plan-cap errors (render_cap) bubble up immediately (waiting won't help —
 *   the ship queue parks them as "waiting for a free slot" instead)
 */
async function writeWithBudget(fn, label) {
  let lastErr;
  for (let attempt = 0, parks = 0; attempt < 12 && parks < 30; ) {
    await acquireRenderWrite();
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.status;
      const msg = String(err?.renderBody?.message || err?.renderBody?.detail || err?.message || '');
      const writeLimited = status === 429 || (status === 403 && /write limit|rate.?limit|too many/i.test(msg));
      if (err?.code === 'render_cap') throw err; // plan slots full — queue parks this, no point retrying here
      const retryable = writeLimited || status === 417 || status === 502 || status === 503 || status === 504;
      if (!retryable) throw err;
      if (writeLimited) {
        // Park the WHOLE fleet on Render's authoritative clock (retry-after can
        // be tens of minutes after a big burst — guessing 70s just 429s again).
        const declared = Number(err.retryAfter || 0);
        const parkMs = declared > 60
          ? Math.min(50 * 60_000, declared * 1000 + 20_000)
          : Math.min(90_000, 70_000 + parks * 10_000);
        if (pauseUntil - Date.now() < parkMs) pauseUntil = Date.now() + parkMs;
        parks += 1;
        console.log(`[render-budget] ${label}: write-limit — fleet parked ${Math.round(parkMs / 1000)}s (retry-after ${declared || 'n/a'}s)`);
        continue; // parks don't burn attempts — Render's clock decides
      }
      attempt += 1;
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }
  throw lastErr;
}

export function renderWriteLoad() {
  const now = Date.now();
  while (writeStamps.length && now - writeStamps[0] > WRITE_WINDOW_MS) writeStamps.shift();
  return { used: writeStamps.length, budget: WRITE_BUDGET, paused: Math.max(0, pauseUntil - now) };
}

const NAME_SAFE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/; // Render web-service names = DNS labels
export function renderName(slug, id) {
  const base = slug.toLowerCase().slice(0, 40).replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const tail = String(id || '').replace(/[^a-z0-9]/gi, '').slice(0, 4).toLowerCase();
  if (base.length <= 36 && NAME_SAFE.test(base)) return base;
  return `${base.slice(0, 33)}-${tail || Math.random().toString(36).slice(2, 6)}`;
}

/** DNS-safe fallback URL used if Create Service omits `url`. */
const predictedUrl = (name) => `https://${name}.onrender.com`;

/**
 * Create a free Python web service for the bot repo (OpenAPI servicePOST shape:
 * top-level name/repo/branch/envVars + serviceDetails{runtime, plan,
 * healthCheckPath, envSpecificDetails{buildCommand, startCommand}}).
 * Returns { id, name, url }.
 */
export async function createWebService({ name, repoUrl, geminiKey }) {
  creds();
  try {
    const created = await writeWithBudget(() => rr('/services', {
      method: 'POST',
      body: {
        type: 'web_service',
        // Spec lists `ownerId`; live endpoint asks for `ownerID` — send both.
        ownerId: process.env.RENDER_OWNER_ID || undefined,
        ownerID: process.env.RENDER_OWNER_ID || undefined,
        name,
        repo: repoUrl,
        branch: 'main',
        envVars: [{ key: 'GEMINI_API_KEY', value: geminiKey }],
        serviceDetails: {
          runtime: 'python',
          plan: 'free',
          healthCheckPath: '/api/health',
          envSpecificDetails: {
            buildCommand: 'pip install -r requirements.txt',
            startCommand: 'gunicorn --workers 1 --threads 2 --timeout 60 app:app',
          },
        },
      },
    }), 'create-service');
    const svc = created?.service || created?.webService || created || {};
    const id = svc.id;
    if (!id) throw new ApiError(502, 'Render did not return a service id — retry deploying.');
    // Freshly created services report an empty `url`; the public URL is
    // deterministic from the name. dashboardUrl is NOT the bot — never use it.
    return { id, name: svc.name || name, url: svc.url || predictedUrl(svc.name || name) };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const message = String(err.renderBody?.message || err.renderBody?.detail || err.message || '');
    if (err.status === 409 || /taken|exists|already/i.test(message)) {
      throw new ApiError(409, 'render_name_taken');
    }
    throw translate(err, `Render could not create the service (${message || 'unknown error'}).` );
  }
}

const LIVE = new Set(['activated', 'live']);
const FAILED = new Set(['build_failed', 'image_push_failed', 'activate_failed', 'runtime_failed', 'canceled', 'run_failed']);
const QUEUED = new Set(['create_requested', 'created', 'build_queued', 'image_push_queued', 'activate_queued', 'deactivate_queued']);

export function mapRenderStatus(rawStatus) {
  const s = String(rawStatus || '').toLowerCase();
  if (LIVE.has(s)) return 'live';
  if (FAILED.has(s)) return 'deploy_failed';
  if (QUEUED.has(s)) return 'queued';
  if (s === 'suspended' || s === 'deactivated' || s === 'suspending') return 'suspended';
  return 'building';
}

/** Trigger a manual deploy (also used to force a rebuild after re-ship). */
export async function triggerDeploy(serviceId) {
  // Budget-gated: a 30-bot bulk redeploy queues itself instead of erroring.
  return writeWithBudget(() => rr(`/services/${serviceId}/deploys`, { method: 'POST', body: {} })
    .catch((err) => { if (err instanceof ApiError && /write limit/i.test(err.message)) throw err; throw translate(err, 'Render could not start the deploy — retry in a moment.'); }));
}

/** Latest deploy status for a service, mapped onto Ship UI states. */
/**
 * Micro-cache: Render READS are limited too (≈400/min). With 30-50 watchers +
 * UI batch polls, an uncached GET per poll can cross that line. Fresh for 10s
 * per service — plenty for a UI that polls every few seconds, and it means a
 * 50-bot page refresh costs ~5 Render reads/minute per bot, not 24.
 */
const statusCache = new Map(); // serviceId -> { at, deployStatus }
const STATUS_TTL_MS = 10_000;      // transitional states change fast — 10s fresh
const STABLE_TTL_MS = 60_000;      // live/suspended rarely change — but STILL checked (a bot deleted on Render's dashboard must disappear here)

export function invalidateDeployStatus(serviceId) { statusCache.delete(serviceId); }

export async function latestDeployStatus(serviceId) {
  const hit = statusCache.get(serviceId);
  if (hit) {
    const ttl = (hit.deployStatus === 'live' || hit.deployStatus === 'suspended') ? STABLE_TTL_MS : STATUS_TTL_MS;
    if (Date.now() - hit.at < ttl) return { deployStatus: hit.deployStatus, cached: true };
  }
  let list;
  try {
    const j = await rr(`/services/${serviceId}/deploys?limit=1`);
    list = Array.isArray(j) ? j : (j?.data || []);
  } catch (err) {
    // 404 = the service no longer exists on Render (user deleted it in the
    // dashboard, say). Signal it as `render_gone` so status routes clear the
    // stale link instead of showing a phantom "live" forever.
    if (err?.status === 404) {
      const gone = new Error('render_gone');
      gone.code = 'render_gone';
      throw gone;
    }
    throw translate(err, 'Render could not report deploy status — retry in a moment.');
  }
  const first = list[0];
  const deploy = first?.deploy || first;
  if (!deploy) return { deployStatus: 'queued', deployId: null };
  const deployStatus = mapRenderStatus(deploy.status || deploy.statusDescription);
  statusCache.set(serviceId, { at: Date.now(), deployStatus });
  if (statusCache.size > 400) { // hygiene
    const cutoff = Date.now() - 60_000;
    for (const [k, v] of statusCache) if (v.at < cutoff) statusCache.delete(k);
  }
  return { deployStatus, deployId: deploy.id || null };
}

/** Suspend a service to reclaim free hours instantly. */
export async function suspendService(serviceId) {
  try {
    await writeWithBudget(() => rr(`/services/${serviceId}/suspend`, { method: 'POST' }), 'suspend');
    return { ok: true };
  } catch (err) {
    throw translate(err, 'Render could not suspend the service — retry in a moment.');
  }
}

/**
 * Permanently delete a service (frees the account slot + quota). 404 means
 * already gone → success, so unpublish stays retry-safe.
 */
export async function deleteService(serviceId) {
  try {
    await writeWithBudget(() => rr(`/services/${serviceId}`, { method: 'DELETE' }), 'delete-service');
    return { ok: true };
  } catch (err) {
    if (err.status === 404) return { ok: true, alreadyGone: true };
    if (err.status === 429) { const e = new ApiError(503, 'Waiting for Render to accept the delete — retrying automatically.'); e.retryAfter = err.retryAfter; throw e; }
    throw translate(err, 'Render could not delete the service — retry in a moment.');
  }
}

/** Resume a suspended service via the official endpoint. */
export async function resumeService(serviceId) {
  try {
    await writeWithBudget(() => rr(`/services/${serviceId}/resume`, { method: 'POST' }), 'resume');
    return { ok: true };
  } catch (err) {
    if (err.status === 409 || err.status === 400) return { ok: false }; // already active
    throw translate(err, 'Render could not resume the service — retry in a moment.');
  }
}

/**
 * Wake a parked bot: the official resume endpoint (when the service id is
 * known) and/or a health request — Render's edge spins the free instance up.
 * The suspension interstitial answers as HTML, so a bot is proven awake only
 * by a JSON response. Retries for ~90s to ride out the cold start.
 */
export async function wakeService(url, { retries = 18, delayMs = 5000 } = {}) {
  const target = `${String(url || '').replace(/\/+$/, '')}/api/health`;
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(target, { method: 'GET', signal: AbortSignal.timeout(30_000) });
      const type = res.headers.get('content-type') || '';
      if (res.ok && type.includes('json')) return { awake: true };
    } catch { /* still waking */ }
    if (i < retries - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return { awake: false };
}
