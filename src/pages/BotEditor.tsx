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
import './LibraryView.css';

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
  const [provider, setProvider] = useState('auto');
  const [loadError, setLoadError] = useState<string | null>(null);

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
      setProvider((b as unknown as Record<string, string>).provider ?? 'auto');
    }).catch((e) => setLoadError((e as Error).message));
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
    if (!botId || !bot) return;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        name, description, personality,
        systemPrompt: systemPrompt + (personalityText ? `\n\n${personalityText}` : ''),
        welcomeMessage: welcome, starterQuestions: starters.filter(Boolean),
        personalityTraits: traits, guardStrictness: guard, memoryEnabled: memory,
        provider, slots,
        designDna: bot.designDna,
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

  if (loadError) {
    return (
      <div>
        <div className="eyebrow">Bot builder</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.7rem', marginBottom: '1rem' }}>Couldn't load this bot</h1>
        <p style={{ color: 'var(--fg-dim)', fontSize: '0.9rem', marginBottom: '1.2rem' }}>{loadError}</p>
        <Button variant="primary" onClick={() => navigate('/library')}>Back to library</Button>
      </div>
    );
  }

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
        <button className="link-more" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flex: 'none' }} onClick={() => navigate(`/chat/${botId}`)}>
          <ArrowLeft style={{ width: 14, height: 14 }} /> Back to chat
        </button>
        <div style={{ minWidth: 0, flex: '1 1 200px' }}>
          <div className="eyebrow">Bot builder</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bot.name}</h1>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.2rem' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.2rem' }}>
          <Card className="settings-card">
            <h3>Appearance</h3>
            <p className="card-desc">The Design DNA palette — changes apply live in the preview, then persist on Save.</p>
            <div style={{ display: 'grid', gap: '0.7rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              {Object.entries(bot.designDna ?? {}).filter(([k]) => ['primaryColor', 'accentColor', 'bg', 'surface', 'surface2', 'text', 'muted', 'border'].includes(k)).map(([k, v]) => (
                <div key={k}>
                  <label className="settings-field" style={{ marginBottom: 0 }}><span>{k}</span>
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
            <p className="card-desc" style={{ marginTop: '1rem', marginBottom: 0 }}>
              Theme: <Badge tone="accent">{bot.designDna?.theme}</Badge> · Layout: {bot.designDna?.layout} · Style: {bot.designDna?.messageStyle}
            </p>
          </Card>

          {/* Live preview of the chat with the current palette */}
          <Card className="settings-card">
            <h3>Live preview</h3>
            <p className="card-desc">This is how the chat looks with the current colors.</p>
            {(() => {
              const dna = bot.designDna ?? {};
              const onPrimary = (() => {
                const m = String(dna.primaryColor ?? '#fff').replace('#', '');
                if (m.length !== 6) return '#fff';
                const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
                return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#12151b' : '#ffffff';
              })();
              return (
                <div style={{
                  borderRadius: 12, overflow: 'hidden', border: '1px solid ' + (dna.border ?? '#2a2f3a'),
                  background: dna.bg ?? '#0b1020', color: dna.text ?? '#e6e9f2',
                  fontSize: '0.82rem', fontFamily: dna.fontFamily ?? 'inherit',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 0.9rem', borderBottom: '1px solid ' + (dna.border ?? '#2a2f3a'), background: dna.surface ?? '#141a2e' }}>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: '0.6rem', fontWeight: 800, background: dna.primaryColor, color: onPrimary }}>{bot.name.slice(0, 2).toUpperCase()}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bot.name}</div>
                      <div style={{ fontSize: '0.6rem', opacity: 0.7 }}>{bot.domain} · {bot.subdomain}</div>
                    </div>
                  </div>
                  <div style={{ padding: '0.9rem', display: 'grid', gap: '0.55rem' }}>
                    <div style={{ alignSelf: 'flex-end', background: dna.primaryColor, color: onPrimary, padding: '0.45rem 0.7rem', borderRadius: '10px 10px 2px 10px', maxWidth: '80%' }}>
                      {bot.welcomeMessage?.split('\n')[0] || 'Hello!'}
                    </div>
                    <div style={{ alignSelf: 'flex-start', background: dna.surface ?? '#141a2e', border: '1px solid ' + (dna.border ?? '#2a2f3a'), padding: '0.45rem 0.7rem', borderRadius: '10px 10px 10px 2px', maxWidth: '85%', color: dna.muted ?? '#8b93a7' }}>
                      What would you like to know?
                    </div>
                    <div style={{ alignSelf: 'flex-start', padding: '0.3rem 0.6rem', borderRadius: 999, border: '1px solid ' + (dna.border ?? '#2a2f3a'), fontSize: '0.68rem', color: dna.muted ?? '#8b93a7' }}>
                      {bot.starterQuestions?.[0] || 'Ask me anything'}
                    </div>
                  </div>
                </div>
              );
            })()}
          </Card>
        </div>
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
              <select className="ui-input" style={{ width: 'auto' }} value={provider}
                onChange={(e) => { setProvider(e.target.value); setDirty(true); }}>
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
          <p className="card-desc">
            Slots are <b>structured fields the bot collects from the user one at a time</b>, like a form inside the chat.
            Instead of free-form answers, the bot asks for each field in order, validates the input (e.g. a valid email),
            shows progress, and confirms before submitting.
          </p>
          <div style={{ padding: '0.8rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 8, fontSize: '0.82rem', color: 'var(--fg-dim)', marginBottom: '1rem', lineHeight: 1.7 }}>
            <span className="mono" style={{ color: 'var(--accent)' }}>EXAMPLE</span> — a booking bot with fields <code>Name</code>, <code>Email</code>, <code>Date</code>:
            <br />User: <i>"I'd like to book a table"</i> → Bot: <i>"What name should the reservation be under?"</i>
            <br />User: <i>"Aisha"</i> → Bot: <i>"Got it. What email should I send the confirmation to?"</i> … and so on, ending with a summary + confirm.
            <br />When slots are configured, <b>any new conversation automatically starts collecting these fields</b> — the bot walks through them, validates each input, and confirms before submitting. After confirmation, the bot switches to free-form AI.
          </div>
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
