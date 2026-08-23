import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import type { Bot, Conversation, Message } from '../types';
import { db } from '../services/db';
import {
  Send, ArrowLeft, Plus, Menu, X, RotateCcw, MessageSquare,
  Play, Pause, SkipForward, SkipBack, LogOut, Globe, Cpu, Cloud, ShieldAlert, BadgeCheck
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './ChatView.css';

/* ---- helpers ---- */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function textOn(hex?: string) {
  if (!hex) return '#fff';
  const m = hex.replace('#', '');
  const v = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  const r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#12151b' : '#ffffff';
}

const PROVIDERS: Record<string, { label: string; Icon: typeof Cpu; cls: string }> = {
  local:          { label: 'Local AI',     Icon: Cpu,         cls: 'p-local' },
  cloud:          { label: 'Cloud AI',      Icon: Cloud,       cls: 'p-cloud' },
  web:            { label: 'Web-enhanced',  Icon: Globe,       cls: 'p-web' },
  'domain-guard': { label: 'Domain Guard',  Icon: ShieldAlert, cls: 'p-guard' },
  profile:        { label: 'Bot Profile',   Icon: BadgeCheck,  cls: 'p-profile' },
};

const SHOWCASE_MS = 7000;

export default function ChatView() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const isShowcase = params.get('showcase') === 'true';
  const playing = params.get('play') !== '0';

  const [bot, setBot] = useState<Bot | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const lastUserText = useRef<string>('');

  /* ---- load bot + conversations ---- */
  useEffect(() => {
    if (!botId) return;
    let alive = true;
    setBot(null);
    setNotFound(false);
    db.getBot(botId).then(found => {
      if (!alive) return;
      if (!found) { setNotFound(true); return; }
      setBot(found);
      db.getConversationsByBot(botId).then(convs => {
        if (!alive) return;
        setConversations(convs);
        if (convs.length > 0) loadConversation(convs[0].id);
        else createConversation(found);
      });
    }).catch(() => alive && setNotFound(true));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  /* ---- showcase auto-advance ---- */
  const goShowcase = useCallback(async (dir: 1 | -1) => {
    const all = await db.getBots();
    if (!all.length) return;
    const i = all.findIndex(b => b.id === botId);
    const next = all[((i < 0 ? 0 : i) + dir + all.length) % all.length];
    if (next) navigate(`/chat/${next.id}?showcase=true&play=${playing ? '1' : '0'}`);
  }, [botId, navigate, playing]);

  useEffect(() => {
    if (!isShowcase || !playing || !bot) return;
    const t = setTimeout(() => goShowcase(1), SHOWCASE_MS);
    return () => clearTimeout(t);
  }, [isShowcase, playing, bot, goShowcase]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const loadConversation = async (convId: string) => {
    setActiveConvId(convId);
    setError(null);
    setDrawerOpen(false);
    const msgs = await db.getMessages(convId);
    setMessages(msgs);
  };

  const createConversation = async (overrideBot?: Bot) => {
    const b = overrideBot || bot;
    if (!b) return;
    const conv = await db.createConversation(b.id, 'New chat');
    const convs = await db.getConversationsByBot(b.id);
    setConversations(convs);
    setActiveConvId(conv.id);
    setMessages([]);
    setError(null);
    setDrawerOpen(false);
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !activeConvId || !botId || isTyping) return;
    lastUserText.current = trimmed;
    setError(null);
    setMessages(prev => [...prev, {
      id: `u-${Date.now()}`, role: 'user', content: trimmed,
    }]);
    setInputValue('');
    if (taRef.current) taRef.current.style.height = 'auto';
    setIsTyping(true);

    const isFirst = messages.filter(m => m.role === 'user').length === 0;

    try {
      const data = await db.sendMessage(botId, activeConvId, trimmed);
      setMessages(prev => [...prev, {
        id: data.messageId, role: 'assistant', content: data.response,
        provider: data.provider, sources: data.sources,
      }]);
      // Title a fresh conversation from its first message.
      if (isFirst) {
        const title = trimmed.length > 38 ? trimmed.slice(0, 38) + '…' : trimmed;
        db.renameConversation(activeConvId, title)
          .then(() => db.getConversationsByBot(botId))
          .then(setConversations)
          .catch(() => {});
      }
    } catch {
      setError('Could not reach the assistant. The backend may be offline.');
    } finally {
      setIsTyping(false);
    }
  };

  const retry = () => { if (lastUserText.current) resend(lastUserText.current); };
  const resend = async (text: string) => {
    if (!activeConvId || !botId) return;
    setError(null);
    setIsTyping(true);
    try {
      const data = await db.sendMessage(botId, activeConvId, text);
      setMessages(prev => [...prev, {
        id: data.messageId, role: 'assistant', content: data.response,
        provider: data.provider, sources: data.sources,
      }]);
    } catch {
      setError('Still unable to reach the assistant. Check that the backend is running.');
    } finally {
      setIsTyping(false);
    }
  };

  const regenerate = async () => {
    if (!activeConvId || !botId || isTyping || regenerating) return;
    setRegenerating(true);
    setError(null);
    try {
      const data = await db.regenerate(botId, activeConvId);
      setMessages(prev => {
        const trimmed = [...prev];
        while (trimmed.length && trimmed[trimmed.length - 1].role === 'assistant') trimmed.pop();
        return [...trimmed, {
          id: data.messageId, role: 'assistant', content: data.response,
          provider: data.provider, sources: data.sources,
        }];
      });
    } catch {
      setError('Could not regenerate the response.');
    } finally {
      setRegenerating(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(inputValue); }
  };
  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const setPlay = (p: boolean) =>
    navigate(`/chat/${botId}?showcase=true&play=${p ? '1' : '0'}`, { replace: true });

  /* ---- render guards ---- */
  if (notFound) {
    return (
      <div className="foundry-bg cv-fallback">
        <p className="mono">This bot no longer exists.</p>
        <button className="btn btn-primary" onClick={() => navigate('/library')}>
          <ArrowLeft /> Back to library
        </button>
      </div>
    );
  }
  if (!bot) return <div className="foundry-bg cv-fallback mono">Loading assistant…</div>;

  const d = bot.designDna;
  const onPrimary = textOn(d.primaryColor);
  const themeVars = {
    '--c-bg': d.bg || '#0b1020',
    '--c-surface': d.surface || '#141a2e',
    '--c-surface2': d.surface2 || '#1b2340',
    '--c-text': d.text || '#e6e9f2',
    '--c-muted': d.muted || '#8b93a7',
    '--c-border': d.border || '#242c46',
    '--c-primary': d.primaryColor,
    '--c-accent': d.accentColor || d.primaryColor,
    '--c-on-primary': onPrimary,
    '--c-radius': d.borderRadius || '14px',
    '--c-font': d.fontFamily || "'Inter', system-ui, sans-serif",
  } as React.CSSProperties;

  const layout = (d.layout || 'Center').toLowerCase();
  const style = (d.messageStyle || 'Bubbles').toLowerCase();
  const bg = (d.backgroundStyle || 'Solid').toLowerCase();
  const welcomeLines = (bot.welcomeMessage || '').split('\n').filter(Boolean);

  return (
    <div
      className={`chat-wrapper layout-${layout} style-${style} bg-${bg} ${d.mono ? 'is-mono' : ''} ${d.mode === 'light' ? 'is-light' : 'is-dark'} ${drawerOpen ? 'drawer-open' : ''}`}
      style={themeVars}
    >
      {/* history panel / drawer */}
      <aside className="chat-sidebar">
        <div className="cv-side-head">
          <button className="cv-side-btn" onClick={() => navigate('/library')} title="Back to library">
            <ArrowLeft /> <span>Library</span>
          </button>
          <button className="cv-side-close" onClick={() => setDrawerOpen(false)} aria-label="Close">
            <X />
          </button>
        </div>
        <button className="cv-newchat" onClick={() => createConversation()}>
          <Plus /> New chat
        </button>
        <div className="cv-history">
          {conversations.map(c => (
            <button
              key={c.id}
              className={`cv-history-item ${c.id === activeConvId ? 'active' : ''}`}
              onClick={() => loadConversation(c.id)}
            >
              <MessageSquare /> <span>{c.title || 'Untitled'}</span>
            </button>
          ))}
        </div>
      </aside>

      {drawerOpen && <div className="cv-scrim" onClick={() => setDrawerOpen(false)} />}

      <main className="chat-main">
        <header className="cv-header">
          <button className="cv-menu" onClick={() => setDrawerOpen(true)} aria-label="Open history">
            <Menu />
          </button>
          <span className="cv-avatar" style={{ background: d.primaryColor, color: onPrimary }}>
            {initials(bot.name)}
          </span>
          <div className="cv-head-text">
            <h2>{bot.name}</h2>
            <span className="cv-domain">{bot.domain} · {bot.subdomain}</span>
          </div>
          <span className="cv-personality mono">{bot.personality}</span>
        </header>

        <div className="cv-messages">
          <div className="cv-messages-inner">
            {messages.length === 0 ? (
              <div className="cv-welcome">
                <span className="cv-welcome-avatar" style={{ background: d.primaryColor, color: onPrimary }}>
                  {initials(bot.name)}
                </span>
                <h1>{bot.name}</h1>
                <p className="cv-welcome-msg">{welcomeLines[0] || `Ask me anything about ${bot.subdomain}.`}</p>
                {welcomeLines[1] && <p className="cv-welcome-sub">{welcomeLines.slice(1).join(' ')}</p>}
                <div className="cv-starters">
                  {(bot.starterQuestions || []).map((q, i) => (
                    <button key={i} className="cv-starter" onClick={() => send(q)}>
                      <span>{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => {
                  const isLast = idx === messages.length - 1;
                  const prov = msg.provider ? PROVIDERS[msg.provider] : null;
                  return (
                    <div key={msg.id} className={`cv-row ${msg.role}`}>
                      {msg.role === 'assistant' && (
                        <span className="cv-row-avatar" style={{ background: d.primaryColor, color: onPrimary }}>
                          {initials(bot.name)}
                        </span>
                      )}
                      <div className="cv-bubble">
                        {msg.role === 'assistant'
                          ? <div className="cv-md"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                          : <div className="cv-usertext">{msg.content}</div>}

                        {msg.sources && msg.sources.length > 0 && (
                          <div className="cv-sources">
                            <span className="cv-sources-h mono">Sources</span>
                            <ul>{msg.sources.map((s, i) => <li key={i}>{s}</li>)}</ul>
                          </div>
                        )}

                        {(prov || (msg.role === 'assistant' && isLast)) && (
                          <div className="cv-meta">
                            {prov && (
                              <span className={`cv-provider ${prov.cls}`}>
                                <prov.Icon /> {prov.label}
                              </span>
                            )}
                            {msg.role === 'assistant' && isLast && !isTyping && (
                              <button className="cv-regen" onClick={regenerate} disabled={regenerating}>
                                <RotateCcw /> {regenerating ? 'Regenerating…' : 'Regenerate'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isTyping && (
                  <div className="cv-row assistant">
                    <span className="cv-row-avatar" style={{ background: d.primaryColor, color: onPrimary }}>
                      {initials(bot.name)}
                    </span>
                    <div className="cv-bubble">
                      <div className="cv-typing"><i /><i /><i /></div>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </>
            )}

            {error && (
              <div className="cv-error">
                <span>{error}</span>
                <button className="cv-retry" onClick={retry}><RotateCcw /> Retry</button>
              </div>
            )}
          </div>
        </div>

        <div className="cv-composer">
          <div className="cv-composer-inner">
            <textarea
              ref={taRef}
              className="cv-input"
              rows={1}
              placeholder={`Message ${bot.name}…`}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={onKeyDown}
              onInput={onInput}
              disabled={isTyping}
            />
            <button
              className="cv-send"
              onClick={() => send(inputValue)}
              disabled={!inputValue.trim() || isTyping}
              aria-label="Send"
              style={{ background: d.primaryColor, color: onPrimary }}
            >
              <Send />
            </button>
          </div>
          <div className="cv-hint mono">Enter to send · Shift+Enter for a new line</div>
        </div>
      </main>

      {isShowcase && (
        <div className="cv-showcase">
          <span className="cv-showcase-label mono">SHOWCASE</span>
          <button onClick={() => goShowcase(-1)} title="Previous"><SkipBack /></button>
          <button onClick={() => setPlay(!playing)} title={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause /> : <Play />}
          </button>
          <button onClick={() => goShowcase(1)} title="Next"><SkipForward /></button>
          <button onClick={() => navigate('/library')} title="Exit showcase"><LogOut /></button>
          {playing && <span key={bot.id} className="cv-showcase-bar" style={{ animationDuration: `${SHOWCASE_MS}ms` }} />}
        </div>
      )}
    </div>
  );
}
