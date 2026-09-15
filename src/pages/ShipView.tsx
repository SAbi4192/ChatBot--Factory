import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Rocket, Archive, GitBranch, Cloud, Moon, Sun, Copy,
  Trash2, RefreshCw, CheckCircle2, XCircle, Loader2, Search,
  LayoutGrid, List, ChevronDown, KeyRound, X, ListChecks, Layers, Zap,
} from 'lucide-react';
import type { Bot } from '../types';
import { db } from '../services/db';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonCard } from '../components/ui/Skeleton';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';
import './ShipView.css';

type Phase = 'idle' | 'working' | 'done' | 'error';
type RowState = { phase: Phase; message?: string; at?: number };
type Action = (b: Bot) => Promise<string>;
type QueueSnap = Awaited<ReturnType<typeof db.shipQueueStatus>>;

const DEPLOY_META: Record<string, { tone: 'default' | 'accent' | 'success' | 'warning' | 'error'; text: string }> = {
  queued: { tone: 'accent', text: 'queued' },
  building: { tone: 'accent', text: 'building' },
  live: { tone: 'success', text: 'live' },
  deploy_failed: { tone: 'error', text: 'failed' },
  suspended: { tone: 'warning', text: 'sleeping' },
};

const STAGE_TEXT: Record<string, string> = {
  queued: 'waiting in queue…',
  delete: 'removing from GitHub + Render…',
  github: 'pushing to GitHub…',
  render: 'starting Render deploy…',
  watch: 'Render is building…',
  done: 'done ✓',
  failed: 'stuck — see message',
};

function relTime(ts?: number | null) {
  if (!ts) return null;
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function ShipView() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [params] = useSearchParams();
  const botsRef = useRef<Bot[]>([]);
  botsRef.current = bots;

  /* view: detailed rows ⇄ big-thumbnail library cards (remembered) */
  const [view, setView] = useState<'rows' | 'cards'>(
    () => (localStorage.getItem('scarlet.shipView') === 'cards' ? 'cards' : 'rows'));
  const flipView = () => setView((v) => {
    const n = v === 'rows' ? 'cards' : 'rows';
    localStorage.setItem('scarlet.shipView', n);
    return n;
  });

  /* the ship queue — the engine works in the background, the UI just watches */
  const [queue, setQueue] = useState<QueueSnap | null>(null);
  const queueRef = useRef<QueueSnap | null>(null);
  queueRef.current = queue;

  /* deploy popup (mode + API keys) */
  const [deployOpen, setDeployOpen] = useState(false);
  const [deployMode, setDeployMode] = useState<'github' | 'github+render'>('github+render');
  const [bulkKey, setBulkKey] = useState('');
  const [perBotKeys, setPerBotKeys] = useState<Record<string, string>>({});
  const [showPerBotKeys, setShowPerBotKeys] = useState(false);
  const [keyWarned, setKeyWarned] = useState(false);

  /* select menu */
  const [selectMenu, setSelectMenu] = useState(false);

  const refresh = useCallback(async () => {
    try { setBots(await db.getBots()); } catch { setBots([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const pre = params.get('bot');
    if (pre) setSelected(new Set([pre]));
  }, [params]);

  const pendingKey = useMemo(
    () => bots.filter((b) => b.deployStatus === 'queued' || b.deployStatus === 'building').map((b) => b.id).join(','),
    [bots]
  );
  const queueActive = !!queue && queue.total > 0;

  // Fast live status: 2.5s while anything is moving, else idle-poll stops.
  useEffect(() => {
    const ids = pendingKey.split(',').filter(Boolean);
    if (!ids.length && !queueActive) return;
    let live = true;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        if (ids.length) {
          // targeted batch status (cheap) instead of refetching thousands of bots
          const map = await db.shipStatusBatch(ids);
          if (!live) return;
          setBots((prev) => prev.map((p) => {
            const s = map[p.id];
            if (!s) return p;
            if (s.renderGone) return { ...p, deployStatus: null, deployUrl: null, repoUrl: p.repoUrl };
            if (s.deployStatus && s.deployStatus !== 'unknown' && s.deployStatus !== p.deployStatus) {
              return { ...p, deployStatus: s.deployStatus as Bot['deployStatus'], deployUrl: s.deployUrl || p.deployUrl };
            }
            return p;
          }));
        } else if (queueActive) {
          // queue moving but nothing built yet — grab fresh shipStage/repoUrl cheaply
          const fresh = await db.getBots();
          if (!live) return;
          setBots(fresh);
        }
      } catch { /* transient */ }
    };
    const t = setInterval(tick, 2500);
    tick();
    return () => { live = false; stopped = true; clearInterval(t); };
  }, [pendingKey, queueActive]);

  // Queue snapshot — the progress bar + per-row stage text all come from here.
  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const s = await db.shipQueueStatus();
        if (!live) return;
        setQueue(s);
        setRows((r) => {
          const n = { ...r };
          for (const j of s.jobs) {
            n[j.botId] = {
              phase: j.status === 'failed' ? 'error' : j.status === 'done' ? 'done' : 'working',
              message: j.message || STAGE_TEXT[j.stage] || j.stage,
              at: j.updatedAt,
            };
          }
          // clear finished/dropped rows after a beat
          for (const id of Object.keys(n)) {
            if (!s.jobs.some((j) => j.botId === id) && n[id].phase === 'working') delete n[id];
          }
          return n;
        });
      } catch { /* offline — keep last */ }
    };
    poll();
    const fast = setInterval(poll, 2000);
    const slow = setInterval(() => { if (queueRef.current && queueRef.current.total === 0) poll(); }, 15000);
    return () => { live = false; clearInterval(fast); clearInterval(slow); };
  }, []);

  // transient (non-queue) row messages fade away on their own
  useEffect(() => {
    const t = setInterval(() => setRows((r) => {
      const now = Date.now();
      const n: Record<string, RowState> = {};
      for (const [k, v] of Object.entries(r)) {
        if (queueRef.current?.jobs.some((j) => j.botId === k)) { n[k] = v; continue; }
        if (v.phase === 'done' || v.phase === 'error') { if (!v.at || now - v.at < 9000) n[k] = v; }
        else n[k] = v;
      }
      return n;
    }), 3000);
    return () => clearInterval(t);
  }, []);

  /** Direct one-off actions (ZIP / sleep / wake) — no rate limits on these. */
  const actNow = useCallback(async (label: string, targets: Bot[], action: Action) => {
    if (!targets.length) return;
    setBusy(true);
    let ok = 0, bad = 0;
    for (const b of targets) {
      setRows((r) => ({ ...r, [b.id]: { phase: 'working', message: label, at: Date.now() } }));
      try {
        const msg = await action(b);
        ok += 1;
        setRows((r) => ({ ...r, [b.id]: { phase: 'done', message: msg, at: Date.now() } }));
      } catch (e) {
        bad += 1;
        const msg = (e as Error).message;
        setRows((r) => ({ ...r, [b.id]: { phase: 'error', message: msg, at: Date.now() } }));
        toast.error(`${b.name}: ${msg}`);
      }
    }
    try { setBots(await db.getBots()); } catch { /* transient */ }
    if (targets.length > 1) toast.success(`${label} — ${ok} done${bad ? `, ${bad} failed` : ''}`, { duration: 3500 });
    setBusy(false);
  }, []);

  const one = (b: Bot, label: string, action: Action) => actNow(label, [b], action);
  const actZip: Action = async (b) => {
    try {
      await db.shipDownloadZip(b.id);
      return 'downloaded ✓';
    } catch (e) {
      const msg = (e as Error).message.toLowerCase();
      if (msg.includes('failed to fetch') || msg.includes('network')) {
        throw new Error('Download failed - could not reach the backend. Run npm run server.');
      }
      throw e;
    }
  };
  const actSleep: Action = async (b) => {
    const r = await db.shipSleep(b.id) as { deferred?: boolean; waitMin?: number };
    if (r.deferred) return 'Sleep scheduled — resting in a few minutes ✓';
    return 'asleep ✓';
  };
  const actWake: Action = async (b) => {
    const r = await db.shipWake(b.id);
    return r.awake ? 'awake ✓' : 'waking… try again in ~50s';
  };
  const sleepBot = (b: Bot) => one(b, 'suspending…', actSleep);

  /* ---- ship to the queue (NEVER blocks, NEVER error-pops) ---- */
  const shipQueue = useCallback(async (targets: Bot[], mode: 'github' | 'github+render', keys: Record<string, string> = {}) => {
    if (!targets.length) return;
    try {
      const botKeys: Record<string, string> = {};
      for (const b of targets) botKeys[b.id] = keys[b.id] || '';
      const r = await db.shipQueueEnqueue(botKeys, mode);
      const bits: string[] = [];
      if (r.accepted) bits.push(`${r.accepted} queued`);
      if (r.skipped) bits.push(`${r.skipped} already in queue`);
      if (r.notFound?.length) bits.push(`${r.notFound.length} not found`);
      toast.success(`Ship queue — ${bits.join(' · ')}`, { duration: 2600 });
      // rows light up from the queue snapshot; nothing else to do here.
    } catch (e) {
      toast.error((e as Error).message || 'Could not reach the ship queue');
    }
  }, []);

  const selectedBots = useMemo(() => bots.filter((b) => selected.has(b.id)), [bots, selected]);

  const openDeploy = () => {
    if (!selectedBots.length) return;
    setDeployOpen(true);
  };

  const launchDeploy = async () => {
    const keys: Record<string, string> = {};
    const anyKey = bulkKey.trim() || Object.values(perBotKeys).some((k) => k.trim());
    for (const b of selectedBots) {
      const k = (perBotKeys[b.id] || '').trim() || bulkKey.trim();
      if (k) keys[b.id] = k;
    }
    if (deployMode === 'github+render' && !anyKey && !keyWarned) {
      setKeyWarned(true);
      toast('No Gemini API key entered — bots will use the Factory default key. Type one below if these bots should answer with YOUR key.', { duration: 5200 });
      return; // keep popup open; one tap on Ship now proceeds
    }
    setDeployOpen(false);
    setKeyWarned(false);
    setBulkKey('');
    setPerBotKeys({});
    setShowPerBotKeys(false);
    await shipQueue(selectedBots, deployMode, keys);
  };

  /* ---- permanent delete popup ---- */
  const [deleteTarget, setDeleteTarget] = useState<Bot | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const shippedBots = useMemo(() => selectedBots.filter((b) => b.repoUrl || b.deployUrl), [selectedBots]);
  const [bulkDelete, setBulkDelete] = useState(false);

  const confirmDelete = async () => {
    const bot = deleteTarget;
    if (!bot) return;
    setDeleteBusy(true);
    try {
      await db.shipQueueDrop(bot.id).catch(() => {}); // drop any in-flight ship first
      // Deletion also runs through the queue: Render write pauses can
      // make a synchronous delete hang the popup — the engine absorbs that.
      await db.shipUnpublishQueue([bot.id]);
      toast.success(`${bot.name} — repo + service are being removed…`, { duration: 2400 });
      setDeleteTarget(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const confirmBulkDelete = async () => {
    const targets = shippedBots;
    if (!targets.length) { setBulkDelete(false); return; }
    setBulkDelete(false);
    // bulk teardown goes through the self-pacing queue — no write-limit popups,
    // rows update live as each repo + service is really gone.
    try {
      const r = await db.shipUnpublishQueue(targets.map((b) => b.id));
      toast.success(`Delete queue — ${r.accepted} bot(s) removing…`, { duration: 2600 });
      setSelected(new Set());
    } catch (e) {
      toast.error((e as Error).message || 'Could not reach the ship queue');
    }
  };

  /* ---- smart select ---- */
  const allSelected = bots.length > 0 && selected.size === bots.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(bots.map((b) => b.id)));
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const setSelect = (pred: (b: Bot) => boolean) => {
    setSelected(new Set(bots.filter(pred).map((b) => b.id)));
    setSelectMenu(false);
  };
  const selectOpts = useMemo(() => ([
    { key: 'all', label: `All ${bots.length} bots`, icon: <ListChecks size={13} />, pred: () => true },
    { key: 'fresh', label: `Not on GitHub yet (${bots.filter((b) => !b.repoUrl).length})`, icon: <GitBranch size={13} />, pred: (b: Bot) => !b.repoUrl },
    { key: 'gh', label: `On GitHub (${bots.filter((b) => b.repoUrl).length})`, icon: <GitBranch size={13} />, pred: (b: Bot) => !!b.repoUrl },
    { key: 'dep', label: `Deployed (${bots.filter((b) => b.deployUrl).length})`, icon: <Cloud size={13} />, pred: (b: Bot) => !!b.deployUrl },
    { key: 'live', label: `Live now (${bots.filter((b) => b.deployStatus === 'live').length})`, icon: <Zap size={13} />, pred: (b: Bot) => b.deployStatus === 'live' },
    { key: 'none', label: 'Clear selection', icon: <X size={13} />, pred: () => false },
  ] as const), [bots]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bots;
    return bots.filter((b) => `${b.name} ${b.domain} ${b.subdomain ?? ''}`.toLowerCase().includes(q));
  }, [bots, query]);

  /* paging — 2000+ bot libraries must not mount 2000 rows at once */
  const [shown, setShown] = useState(60);
  useEffect(() => { setShown(60); }, [query]);
  const paged = useMemo(() => visible.slice(0, shown), [visible, shown]);

  const counts = useMemo(() => ({
    repos: bots.filter((b) => b.repoUrl).length,
    live: bots.filter((b) => b.deployStatus === 'live').length,
    deployed: bots.filter((b) => b.deployUrl).length,
  }), [bots]);

  /* queue progress panel numbers */
  const qTot = queue?.total ?? 0;
  const qDone = queue?.done ?? 0;
  const qPct = qTot ? Math.round((qDone / qTot) * 100) : 0;

  return (
    <div className="ship-page">
      <motion.header className="ship-head" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div>
          <h1><Rocket size={20} /> Ship Bots</h1>
          <p>Export any bot as a standalone app, push a private GitHub repo, get a live Render URL — bulk ship runs in the background queue.</p>
        </div>
        <div className="ship-counts">
          <span className="ship-tile"><b>{bots.length}</b><i>bots</i></span>
          <span className="ship-tile"><b>{counts.repos}</b><i>repos</i></span>
          <span className="ship-tile"><b>{counts.deployed}</b><i>deployed</i></span>
          <span className={`ship-tile ${counts.live ? 'hot' : ''}`}><b>{counts.live}</b><i>live</i></span>
        </div>
      </motion.header>

      {/* ---- live ship-queue progress (only while there's a run) ---- */}
      <AnimatePresence>
        {queueActive && queue && (
          <motion.div className="ship-queuebar" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <div className="sq-top">
              <span><Loader2 size={13} className="ship-spin" /> Shipping — {qDone}/{qTot} ready{queue.working ? ` · ${queue.working} in progress` : ''}{queue.waiting ? ` · ${queue.waiting} queued` : ''}</span>
              {queue.failed > 0 && <span className="sq-fail">{queue.failed} waiting to retry</span>}
            </div>
            <div className="sq-track"><div className="sq-fill" style={{ width: `${qPct}%` }} /></div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="ship-toolbar">
        <div className="ship-selectwrap">
          <label className="ship-selectall">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all bots" />
            Select all
          </label>
          <button type="button" className="ship-smartbtn" onClick={() => setSelectMenu((v) => !v)} aria-haspopup="menu" aria-expanded={selectMenu}>
            Select… <ChevronDown size={12} />
          </button>
          <AnimatePresence>
            {selectMenu && (
              <motion.div className="ship-selectmenu" role="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                {selectOpts.map((o) => (
                  <button key={o.key} role="menuitem" type="button" onClick={() => setSelect(o.pred as (b: Bot) => boolean)}>
                    {o.icon} {o.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {bots.length > 6 && (
          <label className="ship-search"><Search size={12} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="filter bots…" aria-label="Filter bots" />
          </label>
        )}
        <span className="ship-selcount">{selected.size} selected</span>
        <div className="ship-bulk">
          <Button size="sm" variant="ghost" disabled={busy || !selected.size} onClick={() => actNow('downloading bundle…', selectedBots, actZip)}>
            <Archive size={13} /> ZIP <small>{selected.size}</small>
          </Button>
          <Button size="sm" variant="primary" disabled={!selected.size} onClick={openDeploy}>
            <Cloud size={13} /> Deploy <small>{selected.size}</small>
          </Button>
          <Button size="sm" variant="ghost" disabled={busy || !selected.size} onClick={() => actNow('suspending…', selectedBots.filter((b) => b.deployUrl && b.deployStatus !== 'suspended'), actSleep)}>
            <Moon size={13} /> Sleep <small>{selected.size}</small>
          </Button>
          {shippedBots.length > 0 && (
            <Button size="sm" variant="danger" disabled={busy} onClick={() => setBulkDelete(true)} title="Delete — removes GitHub repo + Render service for every selected shipped bot">
              <Trash2 size={13} /> Delete <small>{shippedBots.length}</small>
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={refresh} title="Refresh statuses" aria-label="Refresh">
            <RefreshCw size={13} className={busy ? 'ship-spin' : ''} />
          </Button>
          {/* ---- view switch: right end of the action row ---- */}
          <div className="ship-viewswitch" role="group" aria-label="View mode">
            <button type="button" className={view === 'rows' ? 'on' : ''} onClick={() => view !== 'rows' && flipView()} title="Detailed list"><List size={13} /> Detailed</button>
            <button type="button" className={view === 'cards' ? 'on' : ''} onClick={() => view !== 'cards' && flipView()} title="Big thumbnails"><LayoutGrid size={13} /> Cards</button>
          </div>
        </div>
      </div>

      {/* ---- rows ⇄ cards ---- */}
      <div className={`ship-list ${view === 'cards' ? 'as-cards' : ''}`}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : !bots.length ? (
          <EmptyState icon={<Rocket size={42} />} title="Nothing to ship yet" description="Generate bots in the Factory — then ship them from here." />
        ) : !visible.length ? (
          <EmptyState icon={<Search size={36} />} title="No bots match" description={`Nothing called "${query}".`} />
        ) : paged.map((b) => {
          const row: RowState = rows[b.id] || { phase: 'idle' as Phase };
          const ds = b.deployStatus ? DEPLOY_META[b.deployStatus] : null;
          const shipped = relTime(b.shippedAt);
          return view === 'cards' ? (
            <div key={b.id} className={`ship-card ${row.phase === 'working' ? 'is-working' : ''}`}>
              <label className="ship-card-check">
                <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} aria-label={`Select ${b.name}`} />
              </label>
              <div className="ship-card-thumb" style={{ background: `linear-gradient(135deg, ${b.designDna?.primaryColor || 'var(--accent)'}33, var(--bg-tertiary))` }}>
                {b.avatar ? <img src={b.avatar} alt="" /> : <span>{b.name.slice(0, 2).toUpperCase()}</span>}
              </div>
              <div className="ship-card-body">
                <div className="ship-name">{b.name}</div>
                <div className="ship-sub">{[b.domain, b.subdomain].filter(Boolean).join(' · ')}</div>
                {b.deployUrl ? (
                  <a className="ship-urlchip" href={b.deployUrl} target="_blank" rel="noreferrer" title={b.deployUrl}>{b.deployUrl.replace(/^https?:\/\//, '')}</a>
                ) : <span className="ship-none">not deployed</span>}
              </div>
              <div className="ship-card-foot">
                <div className="ship-steps" aria-hidden="true">
                  <span className={`step ${b.repoUrl ? 'on' : ''}`}><GitBranch size={11} /></span>
                  <span className={`step ${b.deployUrl ? 'on' : ''}`}><Cloud size={11} /></span>
                  <span className={`step ${b.deployStatus === 'live' ? 'on pulse' : ''}`}><span className="live-dot" /></span>
                </div>
                {ds ? <Badge tone={ds.tone}>{ds.text}</Badge> : null}
              </div>
              {row.phase !== 'idle' && (
                <div className={`ship-progress s-${row.phase}`}>
                  {row.phase === 'working' ? <Loader2 size={11} className="ship-spin" /> : row.phase === 'done' ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                  {row.message}
                </div>
              )}
            </div>
          ) : (
            <div key={b.id}
              className={`ship-row ${row.phase === 'working' ? 'is-working' : ''} ${row.phase === 'error' ? 'is-error' : ''}`}>
              <input className="ship-check" type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} aria-label={`Select ${b.name}`} />
              <span className="ship-dot" style={{ background: b.designDna?.primaryColor || 'var(--accent)' }} aria-hidden="true" />
              <div className="ship-meta">
                <div className="ship-namerow">
                  <span className="ship-name">{b.name}</span>
                  {shipped && <span className="ship-shipped" title={`Shipped ${new Date(b.shippedAt!).toLocaleString()}`}>shipped {shipped}</span>}
                </div>
                <div className="ship-sub">{[b.domain, b.subdomain].filter(Boolean).join(' · ')}</div>
                {b.deployUrl && (
                  <span className="ship-urlchip" title={b.deployUrl}>
                    <a href={b.deployUrl} target="_blank" rel="noreferrer">{b.deployUrl.replace(/^https?:\/\//, '')}</a>
                    <button type="button" title="Copy live URL" onClick={() => { navigator.clipboard.writeText(b.deployUrl!); toast.success(`Live URL copied — ${b.name}`); }}><Copy size={11} /></button>
                  </span>
                )}
              </div>
              <div className="ship-steps" aria-hidden="true">
                <span className={`step ${b.repoUrl ? 'on' : ''}`} title={b.repoUrl ? `Repo: ${b.repoUrl}` : 'No GitHub repo yet'}><GitBranch size={11} /></span>
                <span className={`step ${b.deployUrl ? 'on' : ''}`} title={b.deployUrl ? `Service: ${b.deployUrl}` : 'Never deployed'}><Cloud size={11} /></span>
                <span className={`step ${b.deployStatus === 'live' ? 'on pulse' : ''}`} title={`Deploy: ${b.deployStatus || 'none'}`}><span className="live-dot" /></span>
              </div>
              <div className={`ship-state ${ds ? `d-${b.deployStatus}` : 'd-none'}`}>
                {ds ? <Badge tone={ds.tone}>{ds.text}</Badge> : <span className="ship-none">not deployed</span>}
                {row.phase !== 'idle' && (
                  <span className={`ship-progress s-${row.phase}`}>
                    {row.phase === 'working' ? <Loader2 size={11} className="ship-spin" />
                      : row.phase === 'done' ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                    {row.message}
                  </span>
                )}
              </div>
              <div className="ship-acts">
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => one(b, 'building bundle…', actZip)} title="Download the full bot folder as ZIP"><Archive size={13} /></Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => shipQueue([b], 'github')} title={b.repoUrl ? 'Update repo (re-ship)' : 'Ship to GitHub'}><GitBranch size={13} /></Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setSelected(new Set([b.id])); setDeployMode('github+render'); setDeployOpen(true); }} title={b.deployUrl ? 'Redeploy on Render' : 'Deploy on Render'}><Cloud size={13} /></Button>
                {b.deployUrl && (b.deployStatus === 'suspended'
                  ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => one(b, 'waking (~50s)…', actWake)} title="Wake now (a visitor also wakes it)"><Sun size={13} /></Button>
                  : <Button size="sm" variant="ghost" disabled={busy} onClick={() => sleepBot(b)} title="Sleep — suspend to reclaim hours"><Moon size={13} /></Button>)}
                {(b.repoUrl || b.deployUrl) && (
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => setDeleteTarget(b)} title="Delete — removes the GitHub repo AND the Render service"><Trash2 size={13} /></Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {paged.length < visible.length && (
        <div className="ship-more">
          <Button size="sm" variant="ghost" onClick={() => setShown((s) => s + 120)}>
            Show more ({visible.length - paged.length} left)
          </Button>
        </div>
      )}

      {/* ---- DEPLOY popup: mode choice + API key ---- */}
      <Modal open={deployOpen} onClose={() => setDeployOpen(false)} title={`Deploy ${selectedBots.length} bot(s)`} maxWidth={520}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeployOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={launchDeploy}><Rocket size={13} /> Ship now</Button>
          </>
        }>
        <div className="dp-modes">
          <button type="button" className={deployMode === 'github' ? 'on' : ''} onClick={() => setDeployMode('github')}>
            <GitBranch size={16} /> <b>GitHub only</b>
            <small>Private repo + code push. No live URL.</small>
          </button>
          <button type="button" className={deployMode === 'github+render' ? 'on' : ''} onClick={() => setDeployMode('github+render')}>
            <Layers size={16} /> <b>GitHub + Render</b>
            <small>Repo + free live URL on render.com.</small>
          </button>
        </div>

        {deployMode === 'github+render' && (
          <div className="dp-key">
            <label className="dp-keylabel"><KeyRound size={12} /> Gemini API key for these bots</label>
            <input type="password" autoComplete="off" placeholder="AIza… (leave empty to use the Factory default)"
              value={bulkKey} onChange={(e) => { setBulkKey(e.target.value); setKeyWarned(false); }} />
            <button type="button" className="dp-perbot" onClick={() => setShowPerBotKeys((v) => !v)}>
              {showPerBotKeys ? 'Hide per-bot keys' : 'Different key per bot?'}
            </button>
            <AnimatePresence>
              {showPerBotKeys && (
                <motion.div className="dp-keylist" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  {selectedBots.map((b) => (
                    <div key={b.id} className="dp-keyrow">
                      <span className="ship-dot" style={{ background: b.designDna?.primaryColor || 'var(--accent)' }} />
                      <span className="dp-keyname" title={b.name}>{b.name}</span>
                      <input type="password" autoComplete="off" placeholder={bulkKey.trim() ? 'same as above ✓' : 'optional — overrides the key above'}
                        value={perBotKeys[b.id] || ''} onChange={(e) => setPerBotKeys((k) => ({ ...k, [b.id]: e.target.value }))} />
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <p className="dp-note">The key is sent to Render as a secure environment variable — it is never stored in your GitHub repo.</p>
          </div>
        )}
        <p className="dp-eta">Queue ships {(deployMode === 'github') ? 'repos' : 'repos + services'} as fast as GitHub/Render allow — bulk runs self-pace, no waiting required from you.</p>
      </Modal>

      {/* ---- delete popups ---- */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name ?? ''}" from the cloud?`}
        message="This permanently removes the shipped resources — they cannot be undone. The bot itself stays in your Factory, so you can ship it again anytime."
        items={[
          deleteTarget?.repoUrl ? `GitHub repo · ${deleteTarget.repoUrl.replace('https://github.com/', '')}` : '',
          deleteTarget?.deployUrl ? 'Render service · live site' : '',
        ].filter(Boolean)}
        confirmLabel="Delete both"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmDialog
        open={bulkDelete}
        title={`Delete ${shippedBots.length} shipped bot(s) from the cloud?`}
        message="For every selected shipped bot, the GitHub repo AND the Render service are permanently removed. The bots stay here in the Factory."
        items={shippedBots.slice(0, 8).map((b) => b.name).concat(shippedBots.length > 8 ? [`+ ${shippedBots.length - 8} more`] : [])}
        confirmLabel={`Delete ${shippedBots.length} bot(s)`}
        onConfirm={confirmBulkDelete}
        onCancel={() => setBulkDelete(false)}
      />
    </div>
  );
}
