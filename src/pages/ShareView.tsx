import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Factory, Bot as BotIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { db } from '../services/db';
import type { Bot } from '../types';

interface SharedMessage {
  id: string;
  role: string;
  content: string;
  provider?: string;
  sources?: string[] | null;
  createdAt: number;
}

export default function ShareView() {
  const { convId } = useParams<{ convId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<{ title: string | null; bot: Bot; messages: SharedMessage[] } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!convId) return;
    db.getSharedConversation(convId).then(d => {
      if (d) setData(d);
      else setNotFound(true);
    }).catch(() => setNotFound(true));
  }, [convId]);

  if (notFound) {
    return (
      <div className="foundry-bg" style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--fg-dim)' }}>
          <BotIcon style={{ width: 48, height: 48, margin: '0 auto 1rem', opacity: 0.5 }} />
          <p className="mono">Conversation not found or no longer available.</p>
          <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => navigate('/')}>
            <ArrowLeft /> Back to factory
          </button>
        </div>
      </div>
    );
  }
  if (!data) return <div className="foundry-bg" style={{ display: 'grid', placeItems: 'center', height: '100vh' }}><p className="mono" style={{ color: 'var(--fg-dim)' }}>Loading shared conversation…</p></div>;

  const bot = data.bot;
  const d = bot.designDna;
  const themeVars = {
    '--c-bg': d.bg || '#0b1020',
    '--c-surface': d.surface || '#141a2e',
    '--c-text': d.text || '#e6e9f2',
    '--c-muted': d.muted || '#8b93a7',
    '--c-border': d.border || '#242c46',
    '--c-primary': d.primaryColor,
  } as React.CSSProperties;

  return (
    <div className="share-wrapper" style={{ ...themeVars, background: 'var(--c-bg)', color: 'var(--c-text)', minHeight: '100vh', fontFamily: d.fontFamily || "'Inter', sans-serif" }}>
      <header className="share-header" style={{ borderBottom: '1px solid var(--c-border)' }}>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          <Factory /> <span className="btn-text">Back to factory</span>
        </button>
        <span className="share-title mono" style={{ color: 'var(--c-muted)' }}>
          Shared conversation · {bot.name}
        </span>
      </header>
      <main className="share-main" style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {data.messages.map((m) => (
          <div key={m.id} className={`share-message share-${m.role}`} style={{ marginBottom: '1.2rem' }}>
            <div className="share-role mono" style={{ color: 'var(--c-muted)', fontSize: '0.72rem', marginBottom: '0.3rem' }}>
              {m.role === 'user' ? 'User' : bot.name}
            </div>
            <div className="share-content" style={{ background: 'var(--c-surface)', padding: '0.8rem 1rem', borderRadius: 12, lineHeight: 1.65 }}>
              {m.role === 'assistant' ? <ReactMarkdown>{m.content}</ReactMarkdown> : <p>{m.content}</p>}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}