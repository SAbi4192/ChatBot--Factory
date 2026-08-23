import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, UploadCloud, FileText, Trash2, Globe, Search as SearchIcon,
  Loader2, Brain, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import { db } from '../services/db';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Switch } from '../components/ui/Switch';
import { EmptyState } from '../components/ui/EmptyState';

interface Doc {
  id: string;
  name: string;
  status: string;
  chunkCount: number;
  createdAt: number;
}

export default function KBView() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const [botName, setBotName] = useState('this bot');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [stats, setStats] = useState<{ documents: number; chunks: number; chars: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [crawlUrl, setCrawlUrl] = useState('');
  const [crawling, setCrawling] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [memoryOn, setMemoryOn] = useState(() => localStorage.getItem(`cbf:mem:${botId}`) !== 'off');
  const [memQuery, setMemQuery] = useState('');
  const [memHits, setMemHits] = useState<Array<{ conversationId: string; role: string; content: string; score: number }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!botId) return;
    const [bot, d, s] = await Promise.all([
      db.getBot(botId).catch(() => undefined),
      db.listDocuments(botId),
      db.kbStats(botId),
    ]);
    if (bot) setBotName(bot.name);
    setDocs(d);
    setStats(s);
  }, [botId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files || !botId || uploading) return;
    for (const file of Array.from(files)) {
      setUploading(true);
      setProgress(0);
      try {
        const doc = await db.uploadDocument(botId, file, setProgress);
        toast.success(`Indexed "${doc.name}" — ${doc.chunkCount} chunks`);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setUploading(false);
      }
    }
    load();
  };

  const crawl = async () => {
    if (!botId || !crawlUrl.trim()) return;
    setCrawling(true);
    try {
      const doc = await db.crawlUrl(botId, crawlUrl.trim());
      toast.success(`Indexed ${doc.chunkCount} chunks from ${crawlUrl.trim().slice(0, 40)}…`);
      setCrawlUrl('');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCrawling(false);
    }
  };

  const remove = async (doc: Doc) => {
    if (!botId) return;
    try {
      await db.deleteDocument(botId, doc.id);
      toast.success(`Deleted "${doc.name}"`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const recall = async () => {
    if (!botId || !memQuery.trim()) return;
    try {
      setMemHits(await db.recallMemory(botId, memQuery.trim()));
    } catch { setMemHits([]); }
  };

  const toggleMemory = (on: boolean) => {
    setMemoryOn(on);
    if (botId) localStorage.setItem(`cbf:mem:${botId}`, on ? 'on' : 'off');
  };

  return (
    <div>
      <button className="link-more" style={{ marginBottom: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }} onClick={() => navigate(`/chat/${botId}`)}>
        <ArrowLeft style={{ width: 14, height: 14 }} /> Back to chat
      </button>
      <div className="eyebrow" style={{ marginBottom: '0.5rem' }}>Knowledge base</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8rem', marginBottom: '0.3rem' }}>
        {botName}
      </h1>
      <p style={{ color: 'var(--fg-dim)', fontSize: '0.88rem', marginBottom: '1.6rem' }}>
        Upload documents — the bot answers questions from them with cited sources (RAG).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.9rem', marginBottom: '1.4rem' }}>
        <Card><div className="ui-stat-value">{stats?.documents ?? 0}</div><div className="ui-stat-label">Documents</div></Card>
        <Card><div className="ui-stat-value">{stats?.chunks ?? 0}</div><div className="ui-stat-label">Chunks indexed</div></Card>
        <Card><div className="ui-stat-value">{((stats?.chars ?? 0) / 1024).toFixed(1)}</div><div className="ui-stat-label">KB of text</div></Card>
      </div>

      {/* Upload zone */}
      <Card
        className="kb-drop"
        style={{
          borderStyle: 'dashed',
          borderColor: dragging ? 'var(--accent)' : 'var(--border-hover)',
          background: dragging ? 'var(--accent-subtle)' : undefined,
          textAlign: 'center',
          padding: '2.2rem 1rem',
          marginBottom: '1.4rem',
          cursor: 'pointer',
        }}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
      >
        <input ref={fileRef} type="file" hidden multiple accept=".pdf,.docx,.txt,.csv,.json,.md" onChange={(e) => upload(e.target.files)} />
        {uploading ? (
          <div>
            <Loader2 className="spin" style={{ width: 30, height: 30, margin: '0 auto 0.8rem', color: 'var(--accent)' }} />
            <p style={{ fontSize: '0.9rem', marginBottom: '0.6rem' }}>Indexing… {progress}%</p>
            <div className="qm-bar" style={{ maxWidth: 300, margin: '0 auto' }}>
              <div className="qm-fill ok" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <div>
            <UploadCloud style={{ width: 34, height: 34, margin: '0 auto 0.8rem', color: 'var(--accent)' }} />
            <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>Drop files here, or click to browse</p>
            <p className="mono" style={{ color: 'var(--fg-faint)', fontSize: '0.72rem' }}>PDF · DOCX · TXT · CSV · JSON · MD — up to 15 MB</p>
          </div>
        )}
      </Card>

      {/* URL crawl */}
      <Card style={{ marginBottom: '1.4rem' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', marginBottom: '0.4rem' }}>Crawl a URL</h3>
        <p style={{ color: 'var(--fg-dim)', fontSize: '0.82rem', marginBottom: '0.9rem' }}>Paste any web page — its text is fetched, stripped and indexed.</p>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <Input value={crawlUrl} onChange={(e) => setCrawlUrl(e.target.value)} placeholder="https://example.com/page" onKeyDown={(e) => e.key === 'Enter' && crawl()} />
          <Button variant="primary" onClick={crawl} disabled={crawling || !crawlUrl.trim()}>
            {crawling ? <Loader2 className="spin" /> : <Globe />} Index
          </Button>
        </div>
      </Card>

      {/* Documents */}
      <Card style={{ marginBottom: '1.4rem' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', marginBottom: '0.9rem' }}>Documents</h3>
        {docs.length === 0 ? (
          <EmptyState
            icon={<FileText style={{ color: 'var(--fg-faint)' }} />}
            title="No documents yet"
            description="Upload a file or crawl a URL to give this bot knowledge it can cite."
          />
        ) : (
          <div>
            {docs.map((d) => (
              <div className="member-row" key={d.id}>
                <FileText style={{ width: 16, height: 16, color: 'var(--accent)' }} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="m-name">{d.name}</span>
                  <span className="m-email"> {d.chunkCount} chunks</span>
                </span>
                {d.status === 'ready' ? <Badge tone="success"><CheckCircle2 /> Ready</Badge>
                  : d.status === 'failed' ? <Badge tone="error"><XCircle /> Failed</Badge>
                  : <Badge tone="warning"><Clock /> Processing</Badge>}
                <Button variant="ghost" size="sm" onClick={() => remove(d)} aria-label={`Delete ${d.name}`}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Long-term memory */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.4rem' }}>
          <Brain style={{ width: 17, height: 17, color: 'var(--accent)' }} />
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem' }}>Long-term memory</h3>
          <div style={{ marginLeft: 'auto' }}>
            <Switch checked={memoryOn} onChange={toggleMemory} label="Memory enabled" />
          </div>
        </div>
        <p style={{ color: 'var(--fg-dim)', fontSize: '0.82rem', marginBottom: '0.9rem' }}>
          The bot recalls relevant exchanges from earlier sessions with the same user.
        </p>
        {memoryOn && (
          <>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <Input value={memQuery} onChange={(e) => setMemQuery(e.target.value)} placeholder="What does this bot remember about…" onKeyDown={(e) => e.key === 'Enter' && recall()} />
              <Button variant="ghost" onClick={recall}><SearchIcon /></Button>
            </div>
            {memHits.length > 0 && (
              <div style={{ marginTop: '0.8rem', display: 'grid', gap: '0.4rem' }}>
                {memHits.map((h, i) => (
                  <div key={i} className="cv-pinned-item" style={{ fontSize: '0.8rem', padding: '0.5rem 0.7rem', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: '0.1em' }}>{h.role} ·</span>{' '}
                    {h.content.slice(0, 160)}{h.content.length > 160 ? '…' : ''}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}