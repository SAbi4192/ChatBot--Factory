import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MessageSquare, ArrowRight, Loader2 } from 'lucide-react';
import { db } from '../services/db';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import type { Bot } from '../types';
import './LibraryView.css';

type SearchResults = {
  conversations: Array<{ id: string; title: string | null; bot: Bot; updatedAt: number }>;
  messages: Array<{ id: string; content: string; role: string; provider?: string; conversationId: string; conversationTitle: string | null; bot: Bot; createdAt: number }>;
};

export default function SearchView() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const search = async () => {
    const query = q.trim();
    if (!query) return;
    setBusy(true);
    try {
      setResults(await db.search(query));
    } catch { setResults(null); }
    finally { setBusy(false); }
  };

  const highlight = (text: string) => {
    if (!q.trim()) return text;
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((p, i) => p.toLowerCase() === q.trim().toLowerCase() ? <mark key={i}>{p}</mark> : p);
  };

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: '0.5rem' }}>Search</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8rem', marginBottom: '1.6rem' }}>
        Conversations & messages
      </h1>

      <div className="lib-search" style={{ marginBottom: '1.5rem' }}>
        <Search />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search across all conversations…"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') search(); }}
          className="ui-input"
          style={{ paddingLeft: '2.5rem' }}
        />
        <Button variant="primary" size="sm" onClick={search} disabled={busy || !q.trim()} style={{ marginLeft: '0.5rem' }}>
          {busy ? <Loader2 className="spin" /> : <Search />}
        </Button>
      </div>

      {results && results.conversations.length === 0 && results.messages.length === 0 && (
        <EmptyState icon={<Search />} title="Nothing found" description={`No results for "${q}". Try a different search term.`} />
      )}

      {results && results.conversations.length > 0 && (
        <section style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.6rem' }}>Conversations</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {results.conversations.map(c => (
              <button key={c.id} className="dash-conv-item" onClick={() => navigate(`/chat/${c.bot.id}`)}>
                <MessageSquare />
                <span className="title">{c.title || 'Untitled'}</span>
                <span className="sub">{c.bot.name}</span>
                <ArrowRight style={{ width: 14, height: 14, color: 'var(--fg-faint)', marginLeft: 'auto' }} />
              </button>
            ))}
          </div>
        </section>
      )}

      {results && results.messages.length > 0 && (
        <section>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.6rem' }}>Messages</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {results.messages.map(m => (
              <button key={m.id} className="dash-conv-item" onClick={() => navigate(`/chat/${m.bot.id}`)}>
                <span className="meta" style={{ minWidth: 0, flex: 1 }}>
                  <span className="title">{highlight(m.content.slice(0, 160))}</span>
                  <span className="sub">{m.conversationTitle || 'Untitled'} · {m.bot.name} · {m.role}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}