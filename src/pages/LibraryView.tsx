import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Bot } from '../types';
import { db } from '../services/db';
import { Search, Shuffle, Play, MessageSquare, Star, Trash2, Plus, Factory, ArrowRight } from 'lucide-react';
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
    if (window.confirm('Delete all chatbots and every conversation? This cannot be undone.')) {
      await db.deleteAllBots();
      setBots([]);
      navigate('/');
    }
  };

  return (
    <div className="foundry-bg lib">
      <header className="brandbar">
        <div className="wordmark" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <span className="mark"><Factory /></span>
          Chatbot Factory
          <span className="sub">bot library</span>
        </div>
        <div className="lib-topactions">
          <button className="btn btn-ghost" onClick={handleShowcase} disabled={!filtered.length}>
            <Play /> Showcase
          </button>
          <button className="btn btn-ghost" onClick={handleSurprise}>
            <Shuffle /> Forge one
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            <Plus /> New batch
          </button>
        </div>
      </header>

      <main className="lib-main container">
        <div className="lib-head">
          <div>
            <div className="eyebrow">Manufactured assistants</div>
            <h1 className="lib-title">Bot Library</h1>
          </div>
          <button className="lib-reset" onClick={handleReset} title="Delete everything">
            <Trash2 /> Reset all
          </button>
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
          <div className="lib-empty mono">Loading the production line…</div>
        ) : filtered.length === 0 ? (
          <div className="lib-empty">
            {bots.length === 0 ? (
              <>
                <p>No bots yet. Run the foundry to manufacture your first batch.</p>
                <button className="btn btn-primary" onClick={() => navigate('/')}>
                  Open the foundry <ArrowRight />
                </button>
              </>
            ) : (
              <p className="mono">No bots match “{searchQuery}”.</p>
            )}
          </div>
        ) : (
          <>
            <div className="bot-grid">
              {shown.map(bot => {
                const d = bot.designDna || ({} as Bot['designDna']);
                return (
                  <article key={bot.id} className="bot-card" onClick={() => navigate(`/chat/${bot.id}`)}>
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

                    <h3 className="bot-name">{bot.name}</h3>
                    <div className="bot-domain mono">{bot.domain} · {bot.subdomain}</div>
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
                  </article>
                );
              })}
            </div>

            {visible < filtered.length && (
              <div className="lib-more">
                <button className="btn btn-ghost" onClick={() => setVisible(v => v + PAGE)}>
                  Show more ({(filtered.length - visible).toLocaleString()} hidden)
                </button>
              </div>
            )}
          </>
        )}
      </main>
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
