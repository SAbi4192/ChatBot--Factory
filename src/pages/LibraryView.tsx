import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Bot } from '../types';
import { db } from '../services/db';
import { Search, Shuffle, Play, MessageSquare, Star, Trash2, Factory, ArrowRight, Bot as BotIcon, Wand2, Pencil } from 'lucide-react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonCard } from '../components/ui/Skeleton';
import { displayBotName } from '../utils/botName';
import './LibraryView.css';

type Filter = 'all' | 'recent' | 'favorites';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Perceived luminance → pick readable text color for a monogram tile.
function textOn(hex?: string) {
  if (!hex) return '#fff';
  const m = hex.replace('#', '');
  const v = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  const r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#12151b' : '#ffffff';
}

const PAGE = 60;

export default function LibraryView() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [visible, setVisible] = useState(PAGE);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Bot | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    db.getBots().then(setBots).catch(() => setBots([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => setVisible(PAGE), [searchQuery, filter]);

  const stats = useMemo(() => ({
    total: bots.length,
    domains: new Set(bots.map(b => b.domain)).size,
    themes: new Set(bots.map(b => b.designDna?.theme)).size,
    personalities: new Set(bots.map(b => b.personality)).size,
  }), [bots]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = bots;
    if (q) list = list.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.domain.toLowerCase().includes(q) ||
      b.subdomain.toLowerCase().includes(q)
    );
    if (filter === 'favorites') list = list.filter(b => b.favorite);
    if (filter === 'recent') list = [...list].sort((a, b) => b.createdAt - a.createdAt).slice(0, 24);
    return list;
  }, [bots, searchQuery, filter]);

  const shown = filtered.slice(0, visible);

  const toggleFav = async (e: React.MouseEvent, bot: Bot) => {
    e.stopPropagation();
    const fav = await db.toggleFavorite(bot.id).catch(() => bot.favorite);
    setBots(prev => prev.map(b => b.id === bot.id ? { ...b, favorite: fav } : b));
  };

  const handleSurprise = async () => {
    const res = await db.addBots(1);
    if (res?.sample?.id) navigate(`/chat/${res.sample.id}`);
  };

  const handleShowcase = () => {
    if (filtered.length) navigate(`/chat/${filtered[0].id}?showcase=true`);
  };

  const handleReset = async () => {
    setConfirmReset(false);
    await db.deleteAllBots();
    setBots([]);
    toast.success('Factory floor wiped clean — all bots and conversations deleted.');
    navigate('/');
  };

  const handleDeleteBot = async (bot: Bot) => {
    setConfirmDelete(null);
    try {
      await db.deleteBot(bot.id);
      setBots(prev => prev.filter(b => b.id !== bot.id));
      toast.success(`Deleted "${bot.name}"`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /** 3D tilt on hover — sets CSS vars the card transform consumes. */
  const tilt = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${(-py * 6).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(px * 8).toFixed(2)}deg`);
  };

  const isNew = (bot: Bot) => Date.now() - bot.createdAt < 24 * 60 * 60 * 1000;

  return (
    <div className="lib">
      <main className="lib-main container-wide">
        <div className="lib-head">
          <div>
            <div className="eyebrow">Manufactured assistants</div>
            <h1 className="lib-title">Bot Library</h1>
          </div>
          <div className="lib-topactions">
            <Button variant="ghost" size="sm" onClick={handleShowcase} disabled={!filtered.length}>
              <Play /> Showcase
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSurprise}>
              <Shuffle /> Forge one
            </Button>
            <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
              <Trash2 /> Reset all
            </Button>
          </div>
        </div>

        <div className="lib-stats">
          <Stat value={stats.total} label="Total bots" />
          <Stat value={stats.domains} label="Domains" />
          <Stat value={stats.themes} label="Themes" />
          <Stat value={stats.personalities} label="Personalities" />
        </div>

        <div className="lib-toolbar">
          <div className="lib-search">
            <Search />
            <input
              type="text"
              placeholder="Search by name, domain, or specialty…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="lib-filters">
            {(['all', 'recent', 'favorites'] as Filter[]).map(f => (
              <button
                key={f}
                className={`lib-filter ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          bots.length === 0 ? (
            <EmptyState
              icon={<BotIcon />}
              title="Your factory floor is empty"
              description="Run the foundry to manufacture your first batch of domain-specialized assistants."
              action={
                <Button variant="primary" onClick={() => navigate('/factory')}>
                  <Factory /> Open the foundry <ArrowRight />
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Search />}
              title="Nothing found"
              description={`No bots match "${searchQuery}". Try a different search, or forge a new one.`}
              action={
                <Button variant="ghost" onClick={handleSurprise}>
                  <Shuffle /> Forge a random bot
                </Button>
              }
            />
          )
        ) : (
          <>
            <div className="bot-grid">
              {shown.map(bot => {
                const d = bot.designDna || ({} as Bot['designDna']);
                return (
                  <article
                    key={bot.id}
                    className={`bot-card ${isNew(bot) ? 'is-new' : ''} ${(bot.conversationCount ?? 0) > 0 ? 'is-active' : ''}`}
                    onClick={() => navigate(`/chat/${bot.id}`)}
                    onMouseMove={tilt}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.setProperty('--rx', '0deg');
                      e.currentTarget.style.setProperty('--ry', '0deg');
                    }}
                  >
                    <div className="bot-card-top">
                      <span
                        className="bot-mono"
                        style={{ background: d.primaryColor, color: textOn(d.primaryColor) }}
                      >
                        {initials(bot.name)}
                      </span>
                      <button
                        className={`bot-fav ${bot.favorite ? 'on' : ''}`}
                        onClick={e => toggleFav(e, bot)}
                        title={bot.favorite ? 'Unfavorite' : 'Favorite'}
                        aria-label="Toggle favorite"
                      >
                        <Star />
                      </button>
                    </div>

                    <h3 className="bot-name">{displayBotName(bot)}</h3>
                    <div className="bot-domain mono">{bot.subdomain}</div>
                    {bot.creationMethod === 'custom' && (
                      <span className="bot-provenance mono" title="Created with the natural-language custom creator">
                        <Wand2 /> Custom
                      </span>
                    )}
                    <p className="bot-desc">{bot.description}</p>

                    <div className="bot-card-foot">
                      <div className="bot-dna" title={`${d.theme} · ${d.layout} · ${d.messageStyle}`}>
                        <i style={{ background: d.primaryColor }} />
                        <i style={{ background: d.accentColor }} />
                        <i style={{ background: d.surface || d.bg }} />
                        <span className="mono">{d.theme}</span>
                      </div>
                      <span className="bot-chats mono">
                        <MessageSquare /> {bot.conversationCount || 0}
                      </span>
                    </div>

                    {/* quick-action overlay */}
                    <div className="bot-actions" onClick={(e) => e.stopPropagation()}>
                      <button title="Chat" onClick={() => navigate(`/chat/${bot.id}`)} aria-label={`Chat with ${bot.name}`}>
                        <MessageSquare />
                      </button>
                      <button title="Edit" onClick={() => navigate(`/bot/${bot.id}/edit`)} aria-label={`Edit ${bot.name}`}>
                        <Pencil />
                      </button>
                      <button title="Delete" onClick={() => setConfirmDelete(bot)} aria-label={`Delete ${bot.name}`}>
                        <Trash2 />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {visible < filtered.length && (
              <div className="lib-more">
                <Button variant="ghost" onClick={() => setVisible(v => v + PAGE)}>
                  Show more ({(filtered.length - visible).toLocaleString()} hidden)
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      <ConfirmDialog
        open={confirmReset}
        title="Reset the factory?"
        message="Delete every chatbot, conversation, and message? This cannot be undone."
        confirmLabel="Delete everything"
        onConfirm={handleReset}
        onCancel={() => setConfirmReset(false)}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete "${confirmDelete?.name ?? ''}"?`}
        message="This bot, its conversations, and its messages will be permanently deleted."
        confirmLabel="Delete bot"
        onConfirm={() => confirmDelete && handleDeleteBot(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="lib-stat">
      <div className="lib-stat-val mono">{value.toLocaleString()}</div>
      <div className="lib-stat-lbl">{label}</div>
    </div>
  );
}
