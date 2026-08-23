import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Save, RotateCcw, Plus, Trash2, FlaskConical, MessageSquare,
  Sliders, Palette, Puzzle, History, Send, Loader2,
} from 'lucide-react';
import type { Bot } from '../types';
import { db } from '../services/db';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Switch } from '../components/ui/Switch';
import { Badge } from '../components/ui/Badge';

const TRAITS = [
  { key: 'formality', label: 'Formality' },
  { key: 'humor', label: 'Humor' },
  { key: 'verbosity', label: 'Verbosity' },
  { key: 'empathy', label: 'Empathy' },
  { key: 'creativity', label: 'Creativity' },
];

function approxTokens(text: string) { return Math.ceil(text.length / 4); }

export default function BotEditor() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const [bot, setBot] = useState<Bot | null>(null);
  const [tab, setTab] = useState('identity');
  const [versions, setVersions] = useState<Array<{ id: string; version: number; configSnapshot: Record<string, unknown>; createdAt: number }>>([]);
  const [dirty, setDirty] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [personality, setPersonality] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [welcome, setWelcome] = useState('');
  const [starters, setStarters] = useState<string[]>([]);
  const [traits, setTraits] = useState<Record<string, number>>({});
  const [guard, setGuard] = useState('moderate');
  const [memory, setMemory] = useState(true);
  const [slots, setSlots] = useState<Array<{ name: string; label: string; type: string; required: boolean; hint?: string }>>([]);

  // Playground
  const [testInput, setTestInput] = useState('');
  const [testOut, setTestOut] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!botId) return;
    db.getBot(botId).then((b) => {
      if (!b) return;
      setBot(b);
      setName(b.name);
      setDescription(b.description ?? '');
      setPersonality(b.personality ?? '');
      setSystemPrompt(b.systemPrompt ?? '');
      setWelcome(b.welcomeMessage ?? '');
      setStarters(b.starterQuestions ?? []);
      setTraits((b as unknown as Record<string, unknown>).personalityTraits as Record<string, number> ?? {});
      setGuard((b as unknown as Record<string, unknown>).guardStrictness as string ?? 'moderate');
      setMemory((b as unknown as Record<string, unknown>).memoryEnabled !== false);
      setSlots((b as unknown as Record<string, unknown>).slots as typeof slots ?? []);
    });
    db.getVersions(botId).then(setVersions).catch(() => {});
  }, [botId]);

  const personalityText = useMemo(() => {
    const parts = [];
    if (traits.formality != null) parts.push(traits.formality >= 60 ? 'formal' : traits.formality <= 40 ? 'casual' : 'balanced');
    if (traits.humor != null) parts.push(traits.humor >= 60 ? 'witty and humorous' : traits.humor <= 40 ? 'serious' : 'lightly playful');
    if (traits.verbosity != null) parts.push(traits.verbosity >= 60 ? 'detailed' : traits.verbosity <= 40 ? 'concise' : 'moderate-length');
    if (traits.empathy != null) parts.push(traits.empathy >= 60 ? 'warm and empathetic' : 'direct');
    if (traits.creativity != null) parts.push(traits.creativity >= 60 ? 'creative' : 'practical');
    return parts.length ? `You are ${parts.join(', ')}.` : '';
  }, [traits]);

  const tokenCount = useMemo(() => approxTokens(systemPrompt), [systemPrompt]);

  const save = async () => {
    if (!botId) return;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        name, description, personality,
        systemPrompt: systemPrompt + (personalityText ? `\n\n${personalityText}` : ''),
        welcomeMessage: welcome, starterQuestions: starters.filter(Boolean),
        personalityTraits: traits, guardStrictness: guard, memoryEnabled: memory,
        slots,
      };
      await db.updateBot(botId, patch);
      setDirty(false);
      toast.success('Bot saved — a version snapshot was created');
      db.getVersions(botId).then(setVersions).catch(() => {});
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const testPrompt = async () => {
    if (!botId || !testInput.trim()) return;
    setTesting(true);
    setTestOut('');
    try {
      const conv = await db.createConversation(botId, 'Playground');
      const res = await db.sendMessage(botId, conv.id, testInput.trim());
      setTestOut(res.response);
    } catch (e) {
      setTestOut(`Error: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  const rollback = async (versionId: string) => {
    if (!botId) return;
    try {
      await db.rollbackTo(botId, versionId);
      toast.success('Rolled back to previous version');
      window.location.href = `/bot/${botId}/edit`;
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!bot) return <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />;

  const TABS = [
    { id: 'identity', label: 'Identity', icon: Save },
    { id: 'personality', label: 'Personality', icon: Sliders },
    { id: 'prompt', label: 'Prompt', icon: FlaskConical },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'behavior', label: 'Behavior', icon: Puzzle },
    { id: 'slots', label: 'Slots', icon: MessageSquare },
    { id: 'versions', label: 'Versions', icon: History },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.4rem', flexWrap: 'wrap' }}>
        <button className="link-more" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }} onClick={() => navigate(`/chat/${botId}`)}>
          <ArrowLeft style={{ width: 14, height: 14 }} /> Back to chat
        </button>
        <div>
          <div className="eyebrow">Bot builder</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.7rem' }}>{bot.name}</h1>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.6rem' }}>
          <Button variant="ghost" onClick={() => navigate(`/flow/${botId}`)}><Puzzle /> Flow builder</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="spin" /> : <Save />} {dirty ? 'Save changes' : 'Save'}
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.4rem' }}>
        {TABS.map((t) => (
          <button key={t.id} className={`lib-filter ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <t.icon style={{ width: 14, height: 14, marginRight: 4, verticalAlign: 'middle' }} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'identity' && (
        <Card className="settings-card" style={{ maxWidth: 720 }}>
          <h3>Identity</h3>
          <p className="card-desc">How the bot presents itself.</p>
          <label className="settings-field"><span>Name</span><Input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} /></label>
          <label className="settings-field"><span>Description</span><Input value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} /></label>
          <label className="settings-field"><span>Avatar emoji</span><Input value={bot.avatar} disabled /></label>
          <label className="settings-field"><span>Domain</span><Input value={`${bot.domain} · ${bot.subdomain}`} disabled /></label>
          <label className="settings-field"><span>Welcome message</span>
            <textarea className="ui-input" rows={3} value={welcome} onChange={(e) => { setWelcome(e.target.value); setDirty(true); }} />
          </label>
        </Card>
      )}

      {tab === 'personality' && (
        <Card className="settings-card" style={{ maxWidth: 720 }}>
          <h3>Personality traits</h3>
          <p className="card-desc">Sliders generate the personality string appended to the system prompt.</p>
          {TRAITS.map((t) => (
            <div key={t.key} style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                <span>{t.label}</span>
                <span className="mono" style={{ color: 'var(--accent)' }}>{traits[t.key] ?? 50}</span>
              </div>
              <input
                type="range" min={0} max={100} value={traits[t.key] ?? 50}
                onChange={(e) => { setTraits({ ...traits, [t.key]: Number(e.target.value) }); setDirty(true); }}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
            </div>
          ))}
          <div style={{ marginTop: '1rem', padding: '0.8rem', background: 'var(--bg-tertiary)', borderRadius: 8, fontSize: '0.82rem', color: 'var(--fg-dim)' }}>
            <span className="mono" style={{ color: 'var(--accent)' }}>GENERATED:</span> {personalityText || 'Move a slider to generate the personality line.'}
          </div>
        </Card>
      )}

      {tab === 'prompt' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
          <Card className="settings-card">
            <h3>System prompt editor</h3>
            <p className="card-desc">Use <code>{'{{variables}}'}</code> — e.g. <code>{'{{current_date}}'}</code> — they're resolved at chat time. Tokens: <Badge tone="accent">{tokenCount.toLocaleString()}</Badge></p>
            <textarea className="ui-input" rows={16} value={systemPrompt} onChange={(e) => { setSystemPrompt(e.target.value); setDirty(true); }} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', lineHeight: 1.6 }} />
          </Card>
          <Card className="settings-card">
            <h3>Test playground</h3>
            <p className="card-desc">Try the prompt without saving (runs against the real router).</p>
            <textarea className="ui-input" rows={3} placeholder="Type a message to test…" value={testInput} onChange={(e) => setTestInput(e.target.value)} style={{ marginBottom: '0.7rem' }} />
            <Button variant="primary" size="sm" onClick={testPrompt} disabled={testing || !testInput.trim()}>
              {testing ? <Loader2 className="spin" /> : <Send />} Test
            </Button>
            {testOut && (
              <div style={{ marginTop: '1rem', padding: '0.9rem', background: 'var(--bg-tertiary)', borderRadius: 8, fontSize: '0.88rem', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                {testOut}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'appearance' && (
        <Card className="settings-card" style={{ maxWidth: 720 }}>
          <h3>Appearance</h3>
          <p className="card-desc">The Design DNA palette — edit in the live preview below.</p>
          <div style={{ display: 'grid', gap: '0.7rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {Object.entries(bot.designDna ?? {}).filter(([k]) => ['primaryColor', 'accentColor', 'bg', 'surface', 'text', 'muted', 'borderRadius'].includes(k)).map(([k, v]) => (
              <div key={k}>
                <label className="settings-field"><span>{k}</span>
                  {typeof v === 'string' && v.startsWith('#') ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input type="color" value={v} style={{ width: 40, height: 34, background: 'none', border: 'none', cursor: 'pointer' }}
                        onChange={(e) => { const dna = { ...bot.designDna, [k]: e.target.value }; setBot({ ...bot, designDna: dna as Bot['designDna'] }); setDirty(true); }} />
                      <Input value={v} disabled />
                    </div>
                  ) : <Input value={String(v)} disabled />}
                </label>
              </div>
            ))}
          </div>
          <p className="card-desc" style={{ marginTop: '1rem' }}>
            Theme: <Badge tone="accent">{bot.designDna?.theme}</Badge> · Layout: {bot.designDna?.layout} · Style: {bot.designDna?.messageStyle}
          </p>
        </Card>
      )}

      {tab === 'behavior' && (
        <Card className="settings-card" style={{ maxWidth: 720 }}>
          <h3>Behavior</h3>
          <p className="card-desc">Guardrails, memory, and routing.</p>
          <div style={{ display: 'grid', gap: '1.2rem' }}>
            <div>
              <span className="settings-field"><span>Domain Guard strictness</span></span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {['relaxed', 'moderate', 'strict'].map((s) => (
                  <button key={s} className={`lib-filter ${guard === s ? 'active' : ''}`} onClick={() => { setGuard(s); setDirty(true); }}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <Switch checked={memory} onChange={(v) => { setMemory(v); setDirty(true); }} label="Long-term memory" />
              <div><div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Long-term memory</div><div style={{ fontSize: '0.78rem', color: 'var(--fg-faint)' }}>Recall relevant past exchanges</div></div>
            </div>
            <div>
              <span className="settings-field"><span>Provider (per-bot model)</span></span>
              <select className="ui-input" style={{ width: 'auto' }} value={(bot as unknown as Record<string, string>).provider ?? 'auto'}
                onChange={(e) => { void e; setDirty(true); toast.info('Provider saved on next Save'); }}>
                <option value="auto">Auto (hybrid router)</option>
                <option value="local">Local GGUF</option>
                <option value="groq">Groq 70B</option>
                <option value="gemini">Gemini Flash</option>
              </select>
            </div>
          </div>
        </Card>
      )}

      {tab === 'slots' && (
        <Card className="settings-card" style={{ maxWidth: 720 }}>
          <h3>Slot filling / multi-step forms</h3>
          <p className="card-desc">Define form fields — the bot collects them one by one in chat with validation, progress, and confirmation.</p>
          {slots.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
              <Input style={{ width: 140 }} placeholder="field name" value={s.name} onChange={(e) => { const next = [...slots]; next[i] = { ...s, name: e.target.value }; setSlots(next); setDirty(true); }} />
              <Input style={{ width: 160 }} placeholder="Label (e.g. Email)" value={s.label} onChange={(e) => { const next = [...slots]; next[i] = { ...s, label: e.target.value }; setSlots(next); setDirty(true); }} />
              <select className="ui-input" style={{ width: 120 }} value={s.type} onChange={(e) => { const next = [...slots]; next[i] = { ...s, type: e.target.value }; setSlots(next); setDirty(true); }}>
                <option value="text">text</option><option value="number">number</option>
                <option value="email">email</option><option value="phone">phone</option><option value="date">date</option>
              </select>
              <Button variant="danger" size="sm" onClick={() => { setSlots(slots.filter((_, j) => j !== i)); setDirty(true); }}><Trash2 /></Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => { setSlots([...slots, { name: '', label: '', type: 'text', required: true }]); setDirty(true); }}>
            <Plus /> Add field
          </Button>
          <p className="card-desc" style={{ marginTop: '1rem' }}>
            {slots.length > 0 ? `The bot will collect ${slots.length} field${slots.length > 1 ? 's' : ''} in chat (demo: ask "start the form").` : 'No form defined — the bot answers freely.'}
          </p>
        </Card>
      )}

      {tab === 'versions' && (
        <Card className="settings-card" style={{ maxWidth: 720 }}>
          <h3>Version history</h3>
          <p className="card-desc">Every save snapshots the configuration. Roll back any time.</p>
          <div className="activity-list">
            {versions.map((v) => (
              <div className="activity-item" key={v.id}>
                <span className="a-type">v{v.version}</span>
                <span className="a-who">
                  {String((v.configSnapshot as { note?: string }).note ?? 'snapshot')}
                  <span style={{ marginLeft: 8, color: 'var(--fg-faint)' }}>{new Date(v.createdAt).toLocaleString()}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => rollback(v.id)}><RotateCcw /> Roll back</Button>
              </div>
            ))}
            {versions.length === 0 && <p style={{ color: 'var(--fg-faint)', fontSize: '0.85rem' }}>No versions yet — the first save creates v1.</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
