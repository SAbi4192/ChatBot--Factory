import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import type { Bot, Conversation, Message } from '../types';
import { db } from '../services/db';
import {
  Send, ArrowLeft, Plus, Menu, X, RotateCcw, MessageSquare,
  Play, Pause, SkipForward, SkipBack, LogOut, Globe, Cpu, Cloud, ShieldAlert, BadgeCheck,
  Copy, Pin, ThumbsUp, ThumbsDown, Share2, Pencil, Download, Sparkles, FileText,
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
const CTX_WINDOW_TOKENS = 3000; // sliding-window budget (approx tokens)

/** Approximate token count (chars / 4). */
function approxTokens(text: string) { return Math.ceil(text.length / 4); }

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [sharing, setSharing] = useState(false);

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
  }, [messages, isTyping, streamingText]);

  const loadConversation = async (convId: string) => {
    setActiveConvId(convId);
    setError(null);
    setDrawerOpen(false);
    setSummary(null);
    setStreamingText(null);
    const msgs = await db.getMessages(convId);
    setMessages(msgs);
    setEditingId(null);
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
    setStreamingText(null);
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
    setStreamingText('');

    const isFirst = messages.filter(m => m.role === 'user').length === 0;

    try {
      // Try SSE streaming first; fall back to the plain POST on any failure.
      try {
        const meta = await db.streamChat(botId, activeConvId, trimmed, (token) => {
          setStreamingText(prev => (prev ?? '') + token);
        });
        setMessages(prev => [...prev, {
          id: meta.messageId, role: 'assistant', content: meta.streamed ? (streamingTextRef.current ?? '') : meta.provider === 'profile' ? meta.sources?.[0] ?? '' : '',
          provider: meta.provider, sources: meta.sources,
        }]);
        setStreamingText(null);
        // For non-streamed responses (profile/guard), fetch the persisted message.
        if (meta.streamed === false || meta.provider === 'profile' || meta.provider === 'domain-guard') {
          const msgs = await db.getMessages(activeConvId);
          setMessages(prev => {
            const userMsgs = prev.filter(m => m.role === 'user');
            const serverMsgs = msgs.filter(m => m.role === 'assistant');
            const merged = [...userMsgs.slice(0, -1), ...serverMsgs.slice(-1)];
            const lastUser = userMsgs[userMsgs.length - 1];
            if (lastUser) merged.unshift(lastUser);
            return merged;
          });
        }
      } catch {
        // Fallback: non-streaming POST.
        const data = await db.sendMessage(botId, activeConvId, trimmed);
        setMessages(prev => [...prev, {
          id: data.messageId, role: 'assistant', content: data.response,
          provider: data.provider, sources: data.sources,
        }]);
      }
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
      setStreamingText(null);
    }
  };

  // Track the streamed text for the final message body (avoids stale closure).
  const streamingTextRef = useRef('');
  streamingTextRef.current = streamingText ?? '';

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

  /* ---- message actions ---- */
  const copyMessage = (m: Message) => {
    navigator.clipboard.writeText(m.content).then(() => toast.success('Copied to clipboard'));
  };

  const pinMessage = async (m: Message) => {
    if (!activeConvId) return;
    try {
      const { pinned } = await db.togglePin(activeConvId, m.id);
      setMessages(prev => prev.map(x => x.id === m.id ? { ...x, pinned } : x));
      toast.success(pinned ? 'Pinned message' : 'Unpinned message');
    } catch { toast.error('Could not pin message'); }
  };

  const react = async (m: Message, value: 1 | -1) => {
    if (!activeConvId) return;
    const next = m.rating === value ? 0 : value;
    try {
      await db.reactToMessage(activeConvId, m.id, next as -1 | 0 | 1);
      setMessages(prev => prev.map(x => x.id === m.id ? { ...x, rating: next } : x));
    } catch { toast.error('Could not save reaction'); }
  };

  const startEdit = (m: Message) => {
    setEditingId(m.id);
    setEditText(m.content);
  };

  const saveEdit = async (m: Message) => {
    if (!activeConvId || !editText.trim()) return;
    setEditingId(null);
    setIsTyping(true);
    try {
      const res = await db.forkConversation(activeConvId, m.id, editText.trim());
      const convs = await db.getConversationsByBot(res.botId);
      setConversations(convs);
      toast.success('Edited — created a new branch');
      await loadConversation(res.conversationId);
      // The fork regenerates the reply; append it.
      setMessages(prev => [...prev.filter(x => x.role === 'user'), {
        id: res.response.messageId, role: 'assistant', content: res.response.response,
        provider: res.response.provider, sources: res.response.sources,
      }]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIsTyping(false);
    }
  };

  const shareLink = async () => {
    if (!activeConvId) return;
    setSharing(true);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${activeConvId}`);
      toast.success('Share link copied — anyone with it can view this conversation');
    } catch {
      toast.error('Could not copy the link');
    } finally {
      setSharing(false);
    }
  };

  const summarize = async () => {
    if (!activeConvId) return;
    try {
      const { summary: s } = await db.summarizeConversation(activeConvId);
      setSummary(s);
      toast.success('Conversation summarized');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const exportConversation = (format: 'md' | 'json' | 'csv' | 'txt') => {
    const title = bot?.name ?? 'conversation';
    const lines = messages.map(m => `${m.role === 'user' ? '**User**' : `**${bot?.name ?? 'Bot'}**`}:\n\n${m.content}`).join('\n\n---\n\n');
    if (format === 'md') download(`${title}.md`, `# ${title}\n\n${lines}`, 'text/markdown');
    if (format === 'txt') download(`${title}.txt`, messages.map(m => `[${m.role}] ${m.content}`).join('\n\n'), 'text/plain');
    if (format === 'json') download(`${title}.json`, JSON.stringify({ bot: bot?.name, messages }, null, 2), 'application/json');
    if (format === 'csv') {
      const csv = 'role,provider,content\n' + messages.map(m => `"${m.role}","${m.provider ?? ''}","${m.content.replace(/"/g, '""')}"`).join('\n');
      download(`${title}.csv`, csv, 'text/csv');
    }
    setShowExport(false);
  };

  const exportPdf = () => {
    // Themed print stylesheet (see ChatView.css @media print) → browser print-to-PDF.
    window.print();
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

  /* ---- context meter ---- */
  const ctxUsed = messages.reduce((acc, m) => acc + approxTokens(m.content), 0);
  const ctxPct = Math.min(100, Math.round((ctxUsed / CTX_WINDOW_TOKENS) * 100));
  const pinnedMsgs = messages.filter(m => m.pinned);

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
  const showStreaming = streamingText !== null && streamingText !== undefined;

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
              title={c.title || 'Untitled'}
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

          {/* conversation actions */}
          <div className="cv-actions">
            <button className="cv-act" onClick={() => navigate(`/bot/${botId}/edit`)} title="Edit this bot">
              <Pencil /> <span className="hide-mobile">Edit</span>
            </button>
            <button className="cv-act" onClick={() => navigate(`/kb/${botId}`)} title="Knowledge base (RAG)">
              <FileText /> <span className="hide-mobile">Knowledge</span>
            </button>
            <button className="cv-act" onClick={summarize} title="Summarize conversation">
              <Sparkles /> <span className="hide-mobile">Summarize</span>
            </button>
            <button className="cv-act" onClick={shareLink} title="Copy share link" disabled={sharing}>
              <Share2 /> <span className="hide-mobile">Share</span>
            </button>
            <div className="cv-export-wrap">
              <button className="cv-act" onClick={() => setShowExport(o => !o)} title="Export conversation">
                <Download /> <span className="hide-mobile">Export</span>
              </button>
              {showExport && (
                <div className="cv-export-menu">
                  <button onClick={() => exportConversation('md')}><FileText /> Markdown</button>
                  <button onClick={() => exportConversation('json')}><FileText /> JSON</button>
                  <button onClick={() => exportConversation('csv')}><FileText /> CSV</button>
                  <button onClick={() => exportConversation('txt')}><FileText /> Plain text</button>
                  <button onClick={exportPdf}><FileText /> PDF (print)</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* context usage meter */}
        {messages.length > 0 && (
          <div className="cv-ctx" title={`~${ctxUsed.toLocaleString()} tokens used of ~${CTX_WINDOW_TOKENS.toLocaleString()} window`}>
            <div className="cv-ctx-bar"><div className="cv-ctx-fill" style={{ width: `${ctxPct}%` }} /></div>
            <span className="cv-ctx-label mono">context {ctxPct}%</span>
          </div>
        )}

        <div className="cv-messages">
          <div className="cv-messages-inner">
            {summary && (
              <div className="cv-summary">
                <span className="cv-summary-label mono">SUMMARY</span>
                <p>{summary}</p>
                <button className="cv-summary-close" onClick={() => setSummary(null)} aria-label="Dismiss summary"><X /></button>
              </div>
            )}

            {pinnedMsgs.length > 0 && (
              <div className="cv-pinned">
                <span className="cv-pinned-label mono"><Pin /> PINNED</span>
                {pinnedMsgs.map(pm => (
                  <div key={pm.id} className="cv-pinned-item">
                    <span>{pm.role === 'user' ? 'You' : bot.name}:</span> {pm.content.slice(0, 120)}{pm.content.length > 120 ? '…' : ''}
                  </div>
                ))}
              </div>
            )}

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
                    <div key={msg.id} className={`cv-row ${msg.role} ${msg.pinned ? 'is-pinned' : ''}`}>
                      {msg.role === 'assistant' && (
                        <span className="cv-row-avatar" style={{ background: d.primaryColor, color: onPrimary }}>
                          {initials(bot.name)}
                        </span>
                      )}
                      <div className="cv-bubble">
                        {msg.role === 'assistant'
                          ? <div className="cv-md"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                          : editingId === msg.id ? (
                            <div className="cv-edit">
                              <textarea
                                className="cv-edit-input"
                                value={editText}
                                onChange={e => setEditText(e.target.value)}
                                autoFocus
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(msg); } }}
                              />
                              <div className="cv-edit-actions">
                                <button className="cv-edit-save" onClick={() => saveEdit(msg)}>Save (fork)</button>
                                <button className="cv-edit-cancel" onClick={() => setEditingId(null)}>Cancel</button>
                              </div>
                            </div>
                          ) : <div className="cv-usertext">{msg.content}</div>}

                        {msg.sources && msg.sources.length > 0 && (
                          <div className="cv-sources">
                            <span className="cv-sources-h mono">Sources</span>
                            <ul>{msg.sources.map((s, i) => <li key={i}>{s}</li>)}</ul>
                          </div>
                        )}

                        {/* hover toolbar */}
                        <div className="cv-toolbar">
                          <button onClick={() => copyMessage(msg)} title="Copy"><Copy /></button>
                          {msg.role === 'user' && (
                            <button onClick={() => startEdit(msg)} title="Edit (fork)"><Pencil /></button>
                          )}
                          <button className={msg.pinned ? 'on' : ''} onClick={() => pinMessage(msg)} title={msg.pinned ? 'Unpin' : 'Pin'}><Pin /></button>
                          {msg.role === 'assistant' && (
                            <>
                              <button className={msg.rating === 1 ? 'on' : ''} onClick={() => react(msg, 1)} title="Helpful"><ThumbsUp /></button>
                              <button className={msg.rating === -1 ? 'on' : ''} onClick={() => react(msg, -1)} title="Not helpful"><ThumbsDown /></button>
                            </>
                          )}
                        </div>

                        {(prov || (msg.role === 'assistant' && isLast)) && (
                          <div className="cv-meta">
                            {prov && (
                              <span className={`cv-provider ${prov.cls}`}>
                                <prov.Icon /> {prov.label}
                              </span>
                            )}
                            {msg.role === 'assistant' && isLast && !isTyping && !showStreaming && (
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

                {/* streaming cursor */}
                {showStreaming && (
                  <div className="cv-row assistant">
                    <span className="cv-row-avatar" style={{ background: d.primaryColor, color: onPrimary }}>
                      {initials(bot.name)}
                    </span>
                    <div className="cv-bubble">
                      <div className="cv-md"><ReactMarkdown>{streamingText}</ReactMarkdown><span className="cv-cursor" /></div>
                    </div>
                  </div>
                )}

                {isTyping && !showStreaming && (
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
          <div className="cv-hint mono">Enter to send · Shift+Enter for a new line · hover messages for actions</div>
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
