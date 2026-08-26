import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import type { Bot, Conversation, Message } from '../types';
import { db } from '../services/db';
import { markBotSeen } from '../utils/seenBots';
import {
  Send, ArrowLeft, Plus, Menu, X, RotateCcw, MessageSquare,
  Play, Pause, SkipForward, SkipBack, LogOut, Globe, Cpu, Cloud, ShieldAlert, BadgeCheck,
  Copy, Pin, ThumbsUp, ThumbsDown, Share2, Pencil, Download, Sparkles, FileText, Paperclip,
  Mic, MicOff, Volume2, VolumeX, Languages, GitCompare, Loader2,
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
  groq:           { label: 'Cloud AI',      Icon: Cloud,       cls: 'p-cloud' },
  gemini:         { label: 'Cloud AI',      Icon: Cloud,       cls: 'p-cloud' },
  web:            { label: 'Web-enhanced',  Icon: Globe,       cls: 'p-web' },
  'domain-guard': { label: 'Domain Guard',  Icon: ShieldAlert, cls: 'p-guard' },
  profile:        { label: 'Bot Profile',   Icon: BadgeCheck,  cls: 'p-profile' },
};

const LANG_CODES: Record<string, string> = {
  ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN', bn: 'bn-IN',
  hi: 'hi-IN', ja: 'ja-JP', zh: 'zh-CN', ar: 'ar-SA', ru: 'ru-RU', en: 'en-US',
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

/**
 * Detect the spoken language of a text from its script, so TTS can pick a
 * voice that can actually pronounce it (an English voice can't read Tamil).
 */
function langFromScript(text: string): string {
  const t = String(text || '');
  if (/[\u0B80-\u0BFF]/.test(t)) return 'ta';      // Tamil
  if (/[\u0C00-\u0C7F]/.test(t)) return 'te';      // Telugu
  if (/[\u0C80-\u0CFF]/.test(t)) return 'kn';      // Kannada
  if (/[\u0D00-\u0D7F]/.test(t)) return 'ml';      // Malayalam
  if (/[\u0980-\u09FF]/.test(t)) return 'bn';      // Bengali
  if (/[\u0900-\u097F]/.test(t)) return 'hi';      // Hindi / Marathi
  if (/[\u3040-\u30FF\u3400-\u9FFF]/.test(t)) return 'ja'; // Japanese / Chinese
  if (/[\u0600-\u06FF]/.test(t)) return 'ar';      // Arabic
  if (/[\u0400-\u04FF]/.test(t)) return 'ru';      // Russian
  return 'en';
}

/**
 * Pick a female voice for a language code when one exists. Windows/Edge ship
 * voices like Microsoft Heera (hi-IN), Shyamala (ta-IN), Shruti (te-IN),
 * Sobha (ml-IN), Sapna (kn-IN), Nanami (ja-JP).
 */
function pickFemaleVoiceFor(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  const matches = voices.filter(v => (v.lang || '').toLowerCase().startsWith(lang));
  const female =
    matches.find(v => /female|zira|samantha|victoria|karen|susan|moira|tessa|fiona|ava|jenny|aria|libby|sonia|natural|heera|priya|shyamala|shruti|sobha|sapna|nanami|tanishaa|nancy|amala|ananya|ishani|kavya|madhu|swara|geetha|vani/i.test(v.name)) ||
    matches.find(v => /female/i.test(v.name)) ||
    matches[0] || null;
  return female;
}

/**
 * Display-time emoji cleanup. Old messages stored before the backend cleaner
 * existed can contain emoji overload ("🌟✨💫 …" × 100). Collapse runs of 3+
 * identical emojis to one and cap the total at 8 — display only; the raw
 * content is preserved for copy/export.
 */
function tidyForDisplay(text: string): string {
  let s = String(text || '');
  s = s.replace(/(\p{Extended_Pictographic})(?:\s*\1){2,}/gu, '$1');
  let count = 0;
  let out = '';
  for (const ch of s) {
    if (/\p{Extended_Pictographic}/u.test(ch)) {
      count += 1;
      if (count > 8) continue;
    }
    out += ch;
  }
  return out;
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
  const [summaryForConv, setSummaryForConv] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showGuard, setShowGuard] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      markBotSeen(botId);
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
    stopSpeaking();
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
        await db.streamChat(botId, activeConvId, trimmed, (token) => {
          setStreamingText(prev => (prev ?? '') + token);
        });
        setStreamingText(null);
        // The server is the single source of truth: both the user message and
        // the reply are persisted before streamChat resolves, so reload the
        // whole thread. The previous merge kept only the LAST assistant reply
        // and silently dropped every earlier message from the UI.
        const msgs = await db.getMessages(activeConvId);
        setMessages(msgs);
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
    // If we already have a summary for this conversation, just open the panel.
    if (summary && summaryForConv === activeConvId) { setSummaryOpen(true); return; }
    setSummarizing(true);
    setSummaryOpen(true);
    try {
      const { summary: s } = await db.summarizeConversation(activeConvId);
      setSummary(s);
      setSummaryForConv(activeConvId);
      toast.success('Conversation summarized');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSummarizing(false);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !botId) return;
    try {
      toast.info(`Uploading ${file.name}…`);
      await db.uploadDocument(botId, file);
      toast.success(`${file.name} uploaded to knowledge base!`);
    } catch (err) {
      toast.error(`Upload failed: ${(err as Error).message}`);
    }
    e.target.value = '';
  };

  // ---- Voice input (Web Speech API, no backend needed) ----
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const toggleVoice = () => {
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) { toast.error('Voice input is not supported in this browser — try Chrome or Edge'); return; }
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const rec = new (SR as new () => {
      lang: string; interimResults: boolean;
      start: () => void; stop: () => void;
      onresult: (e: { results?: Array<Array<{ transcript?: string }>> }) => void;
      onend: () => void; onerror: () => void;
    })();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript ?? '';
      if (text) setInputValue(v => (v ? v + ' ' : '') + text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); toast.error('Could not hear you — please try again'); };
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  // ---- Text-to-speech (per-message speak button) ----
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  // Prefer a young female English voice (Samantha, Zira, Google US English…).
  const femaleVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const audioRefs = useRef<HTMLAudioElement[]>([]);
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis?.getVoices?.() ?? [];
      if (!voices.length) return;
      const en = voices.filter(v => /^en[-_]/.test(v.lang || ''));
      const pool = en.length ? en : voices;
      femaleVoiceRef.current =
        pool.find(v => /female|zira|samantha|victoria|karen|susan|moira|tessa|fiona|ava|jenny|aria|libby|sonia|natural/i.test(v.name)) ||
        pool[0] || null;
    };
    loadVoices();
    window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', loadVoices);
  }, []);

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel?.();
    audioRefs.current.forEach(a => { try { a.pause(); a.src = ''; } catch { /* noop */ } });
    audioRefs.current = [];
    setSpeakingId(null);
  };

  // Google Translate TTS — free, no key, correct pronunciation for Indian
  // languages the browser's local voices often can't handle. The audio is
  // streamed through OUR backend (/api/tts) so the browser never hits
  // cross-origin blocking with translate.google.com. Long text is split into
  // ≤180-char chunks played in sequence.
  const googleTtsUrl = (text: string, tl: string) =>
    `/api/tts?tl=${tl}&q=${encodeURIComponent(text)}`;

  const speakViaGoogle = (text: string, tl: string, onDone: () => void, onFail: (err?: unknown) => void) => {
    const chunks: string[] = [];
    let rest = String(text || '');
    while (rest.length > 180 && chunks.length < 5) { chunks.push(rest.slice(0, 180)); rest = rest.slice(180); }
    if (rest) chunks.push(rest);
    let i = 0;
    const playNext = () => {
      if (i >= chunks.length) { onDone(); return; }
      const audio = new Audio(googleTtsUrl(chunks[i], tl));
      audioRefs.current.push(audio);
      audio.onended = () => { i += 1; playNext(); };
      audio.onerror = () => { onFail(new Error(`audio failed for chunk ${i}`)); };
      audio.play().catch((e) => onFail(e));
    };
    playNext();
  };

  const speakLocal = (text: string) => {
    const u = new SpeechSynthesisUtterance(text);
    const lang = langFromScript(text);
    // Always set the utterance language so the browser matches a voice that
    // can actually pronounce the script (e.g. "Google தமிழ்").
    u.lang = LANG_CODES[lang] || 'en-US';
    const voice = pickFemaleVoiceFor(window.speechSynthesis.getVoices() ?? [], lang);
    if (voice) u.voice = voice;
    u.pitch = 1.12;
    u.rate = 1;
    u.onend = () => setSpeakingId(null);
    u.onerror = () => {
      // Local engine failed silently — fall back to online Google TTS.
      speakViaGoogle(text, lang === 'zh' ? 'zh-CN' : lang, () => setSpeakingId(null), (err) => { setSpeakingId(null); toast.error(`Speech unavailable (${err instanceof Error ? err.message : 'unknown error'})`); });
    };
    window.speechSynthesis.speak(u);
  };

  const speak = (text: string, id: string) => {
    const hasLocal = 'speechSynthesis' in window;
    if (!hasLocal && typeof Audio === 'undefined') { toast.error('Speech is not supported in this browser'); return; }
    if (speakingId === id) { stopSpeaking(); return; }
    stopSpeaking();
    const plain = text.replace(/[#*`_>\[\]()]/g, ' ').replace(/\s+/g, ' ').slice(0, 2000);
    setSpeakingId(id);
    const lang = langFromScript(plain);
    // Non-English (Tamil/Hindi/Telugu/…): the browser's local voices are
    // unreliable for these scripts, so use Google's online TTS first — it
    // always pronounces them correctly. English keeps the young female voice.
    if (lang === 'en') {
      if (hasLocal) {
        // Chrome bug: speaking immediately after cancel() can silently fail.
        setTimeout(() => speakLocal(plain), 60);
      } else {
        speakViaGoogle(plain, 'en', () => setSpeakingId(null), (err) => { setSpeakingId(null); toast.error(`Speech unavailable (${err instanceof Error ? err.message : 'unknown error'})`); });
      }
    } else {
      speakViaGoogle(plain, lang === 'zh' ? 'zh-CN' : lang, () => setSpeakingId(null), () => {
        if (hasLocal) setTimeout(() => speakLocal(plain), 60);
        else { setSpeakingId(null); toast.error('Speech unavailable for this language — check your connection'); }
      });
    }
  };

  // ---- Live model comparison (local vs Groq vs Gemini) ----
  const [compareOpen, setCompareOpen] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [compareQuery, setCompareQuery] = useState('');
  const [compareResults, setCompareResults] = useState<Array<{ provider: string; model: string; response: string }>>([]);
  const openCompare = async () => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const q = inputValue.trim() || lastUser?.content || lastUserText.current;
    if (!q || !botId) { toast.info('Type a message or ask something first'); return; }
    setCompareQuery(q);
    setCompareOpen(true);
    setComparing(true);
    setCompareResults([]);
    try {
      const { results } = await Promise.race([
        db.compareModels(botId, q),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Compare timed out (60s) — one of the providers is too slow')), 60000)),
      ]);
      setCompareResults(results);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setComparing(false);
    }
  };

  // ---- Per-message translation ----
  const [translations, setTranslations] = useState<Record<string, { lang: string; text: string }>>({});
  const [translateMenuFor, setTranslateMenuFor] = useState<string | null>(null);
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const LANGUAGES: Array<[string, string]> = [
    ['ta', 'தமிழ்'], ['te', 'తెలుగు'], ['hi', 'हिन्दी'], ['ml', 'മലയാളം'],
    ['kn', 'ಕನ್ನಡ'], ['ja', '日本語'], ['en', 'English'],
  ];
  const translateMessage = async (msg: { id: string; content: string }, lang: string) => {
    setTranslateMenuFor(null);
    setTranslatingId(msg.id);
    try {
      const { translation } = await db.translateText(msg.content, lang);
      setTranslations(prev => ({ ...prev, [msg.id]: { lang, text: translation } }));
      toast.success(`Translated to ${LANGUAGES.find(([c]) => c === lang)?.[1] ?? lang}`);
    } catch (e) {
      const m = (e as Error).message;
      toast.error(/404|not found/i.test(m)
        ? 'Translation service is not running — restart the backend (npm run server)'
        : `Translation failed: ${m}`);
    } finally {
      setTranslatingId(null);
    }
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
    '--c-heading': d.headingFont || 'inherit',
  } as React.CSSProperties;

  const layout = (d.layout || 'Center').toLowerCase();
  const style = (d.messageStyle || 'Bubbles').toLowerCase();
  const bg = (d.backgroundStyle || 'Solid').toLowerCase();
  const shape = d.avatarShape || 'round';
  const radius = d.radiusScale || 'medium';
  const glow = d.accentGlow ? 'on' : 'off';
  const welcomeLines = (bot.welcomeMessage || '').split('\n').filter(Boolean);
  const showStreaming = streamingText !== null && streamingText !== undefined;

  return (
    <div
      className={`chat-wrapper layout-${layout} style-${style} bg-${bg} shape-${shape} rad-${radius} glow-${glow} ${d.mono ? 'is-mono' : ''} ${d.mode === 'light' ? 'is-light' : 'is-dark'} ${drawerOpen ? 'drawer-open' : ''}`}
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
        <div className="cv-history-label mono">
          <span>Conversations</span>
          <span className="cv-history-count">{conversations.length}</span>
        </div>
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
          <button className="cv-menu" onClick={() => setDrawerOpen(true)} aria-label="Open conversation history" title="Conversation history">
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
            <button className="cv-act" onClick={openCompare} title="Compare AI models side by side">
              <GitCompare /> <span className="hide-mobile">Compare</span>
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
            <button className="cv-act" onClick={() => setShowGuard(o => !o)} title="Why did the guard allow/refuse?">
              <ShieldAlert style={{ width: 12, height: 12 }} /> guard
            </button>
          </div>
        )}

        {/* Domain Guard explainability panel (dev toggle) */}
        {showGuard && (
          <div className="cv-guard-panel" role="region" aria-label="Domain Guard explainability">
            <span className="cv-summary-label mono">DOMAIN GUARD — HOW IT DECIDED</span>
            <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.3rem', fontSize: '0.78rem', lineHeight: 1.6 }}>
              <p><b>Layer order:</b> 0 Greetings → 1 Own-field evidence → 2 Foreign-field redirect → 3 Context follow-up → 4 LLM classifier → 5 Default allow</p>
              <p><b>Positive off-topic detection:</b> unusual questions are never false-refused — they're classified, not blocked.</p>
              <p><b>This conversation:</b> {messages.filter(m => m.provider === 'domain-guard').length} redirect(s) fired. Greetings answer from the bot profile instantly (no AI cost).</p>
            </div>
          </div>
        )}

        <div className="cv-messages">
          <div className="cv-messages-inner">

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
                          ? <div className="cv-md"><ReactMarkdown>{tidyForDisplay(msg.content)}</ReactMarkdown></div>
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
                          ) : <div className="cv-usertext">{tidyForDisplay(msg.content)}</div>}

                        {msg.sources && msg.sources.length > 0 && (
                          <div className="cv-sources">
                            <span className="cv-sources-h mono">Sources</span>
                            <ul>{msg.sources.map((s, i) => <li key={i}>{s}</li>)}</ul>
                          </div>
                        )}

                        {translations[msg.id] && (
                          <div className="cv-translation">
                            <span className="cv-translation-label mono">
                              {LANGUAGES.find(([c]) => c === translations[msg.id].lang)?.[1] ?? translations[msg.id].lang}
                            </span>
                            <div className="cv-translation-text">{translations[msg.id].text}</div>
                            <div className="cv-translation-actions">
                              <button
                                className={speakingId === `tr-${msg.id}` ? 'cv-translation-speak on' : 'cv-translation-speak'}
                                onClick={() => speak(translations[msg.id].text, `tr-${msg.id}`)}
                                title={speakingId === `tr-${msg.id}` ? 'Stop reading' : 'Read the translation aloud'}
                              >
                                <Volume2 /> {speakingId === `tr-${msg.id}` ? 'Stop' : 'Listen'}
                              </button>
                              <button className="cv-translation-clear" onClick={() => setTranslations(prev => { const n = { ...prev }; delete n[msg.id]; return n; })}>
                                <X style={{ width: 11, height: 11 }} /> Remove
                              </button>
                            </div>
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
                              <button className={speakingId === msg.id ? 'on' : ''} onClick={() => speak(msg.content, msg.id)} title={speakingId === msg.id ? 'Stop reading' : 'Read aloud'}><Volume2 /></button>
                              <button onClick={() => setTranslateMenuFor(translateMenuFor === msg.id ? null : msg.id)} title="Translate"><Languages /></button>
                              <button className={msg.rating === 1 ? 'on' : ''} onClick={() => react(msg, 1)} title="Helpful"><ThumbsUp /></button>
                              <button className={msg.rating === -1 ? 'on' : ''} onClick={() => react(msg, -1)} title="Not helpful"><ThumbsDown /></button>
                            </>
                          )}
                        </div>

                        {(prov || (msg.role === 'assistant' && isLast)) && (
                          <div className="cv-meta-wrap">
                            <div className="cv-meta">
                              {prov && (
                                <span className={`cv-provider ${prov.cls}`}>
                                  <prov.Icon /> {prov.label}
                                </span>
                              )}
                              {msg.role === 'assistant' && (
                                <button className="cv-meta-translate" onClick={() => setTranslateMenuFor(translateMenuFor === msg.id ? null : msg.id)} disabled={translatingId === msg.id} title="Translate this message">
                                  {translatingId === msg.id ? <Loader2 className="spin" style={{ width: 12, height: 12 }} /> : <Languages />} Translate
                                </button>
                              )}
                              {msg.role === 'assistant' && isLast && !isTyping && !showStreaming && (
                                <button className="cv-regen" onClick={regenerate} disabled={regenerating}>
                                  <RotateCcw /> {regenerating ? 'Regenerating…' : 'Regenerate'}
                                </button>
                              )}
                            </div>
                            {translateMenuFor === msg.id && (
                              <div className="cv-translate-menu">
                                {LANGUAGES.map(([code, label]) => (
                                  <button key={code} onClick={() => translateMessage(msg, code)}>{label}</button>
                                ))}
                              </div>
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
                      <div className="cv-md"><ReactMarkdown>{tidyForDisplay(streamingText ?? '')}</ReactMarkdown><span className="cv-cursor" /></div>
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
            <button
              className={`cv-attach-btn ${listening ? 'is-listening' : ''}`}
              onClick={toggleVoice}
              title={listening ? 'Stop listening' : 'Voice input (speak your message)'}
              aria-label={listening ? 'Stop listening' : 'Voice input'}
            >
              {listening ? <MicOff /> : <Mic />}
            </button>
            <button
              className="cv-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Upload document to knowledge base"
              aria-label="Upload document to knowledge base"
            >
              <Paperclip />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".txt,.pdf,.md,.csv,.docx"
              onChange={handleFileUpload}
            />
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

      {/* Floating stop button — visible whenever speech is active */}
      {speakingId && (
        <button className="cv-stop-speech" onClick={stopSpeaking} title="Stop reading aloud" aria-label="Stop reading aloud">
          <VolumeX /> Stop reading
        </button>
      )}

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

      {/* Conversation summary panel (slides in from the right, inside the chat) */}
      {summaryOpen && (
        <>
          <div className="cv-summary-scrim" onClick={() => setSummaryOpen(false)} />
          <aside className="cv-summary-panel" role="dialog" aria-label="Conversation summary">
            <div className="cv-summary-head">
              <div style={{ minWidth: 0 }}>
                <div className="cv-summary-title">Conversation summary</div>
                <div className="cv-summary-sub mono">FULL THREAD → CONDENSED</div>
              </div>
              <button className="cv-summary-close" onClick={() => setSummaryOpen(false)} aria-label="Close summary" title="Close">
                <X />
              </button>
            </div>
            <div className="cv-summary-body">
              {summarizing ? (
                <div className="cv-summary-loading">
                  <Loader2 className="spin" />
                  <p>Condensing the conversation…</p>
                </div>
              ) : summary ? (
                <div className="cv-md"><ReactMarkdown>{summary}</ReactMarkdown></div>
              ) : (
                <p style={{ color: 'var(--c-muted)', fontSize: '0.88rem' }}>No summary yet — click Summarize in the header.</p>
              )}
            </div>
            {summary && (
              <div className="cv-summary-foot">
                <button className="cv-summary-copy" onClick={() => { navigator.clipboard.writeText(summary); toast.success('Summary copied'); }}>
                  <Copy /> Copy summary
                </button>
              </div>
            )}
          </aside>
        </>
      )}

      {/* Live model comparison modal */}
      {compareOpen && (
        <div className="cv-compare-overlay" onClick={() => setCompareOpen(false)}>
          <div className="cv-compare" onClick={(e) => e.stopPropagation()}>
            <div className="cv-compare-head">
              <div style={{ minWidth: 0 }}>
                <div className="cv-compare-title">Model comparison</div>
                <div className="cv-compare-query">{compareQuery.slice(0, 120)}{compareQuery.length > 120 ? '…' : ''}</div>
              </div>
              <button className="cv-compare-close" onClick={() => setCompareOpen(false)} title="Close"><X /></button>
            </div>
            {comparing ? (
              <div className="cv-compare-loading">
                <Loader2 className="spin" />
                <p>Asking all three models…</p>
              </div>
            ) : compareResults.length === 0 ? (
              <p className="cv-compare-loading">No providers responded — add a Groq or Gemini key in .env to see cloud answers.</p>
            ) : (
              <div className="cv-compare-grid">
                {compareResults.map((r) => (
                  <div key={r.provider} className={`cv-compare-col p-${r.provider}`}>
                    <div className="cv-compare-col-head">
                      <span className={`cv-provider p-${r.provider}`}>{r.model || r.provider}</span>
                      <button
                        className="cv-compare-speak"
                        onClick={() => speak(r.response, `cmp-${r.provider}`)}
                        title={speakingId === `cmp-${r.provider}` ? 'Stop reading' : 'Read aloud'}
                      >
                        <Volume2 />
                      </button>
                    </div>
                    <div className="cv-compare-body">{r.response}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
