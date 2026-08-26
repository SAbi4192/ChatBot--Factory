import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Wand2, RefreshCw, ArrowRight, Loader2, X, Bot as BotIcon } from 'lucide-react';
import { db } from '../services/db';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';

const EXAMPLES = [
  'Coding tutor for Python beginners',
  'Kitchen helper that suggests recipes from ingredients I have',
  'Interview prep coach for software engineering',
  'Personal finance advisor for college students',
  'Dungeon master for D&D campaigns',
  'Yoga instructor for morning routines',
  'Astrology bot that gives daily horoscopes',
  'Language buddy for practicing Spanish conversation',
];

interface DesignShape {
  name: string;
  domain: string;
  subdomain: string;
  description: string;
  personality: string;
  systemPrompt: string;
  welcomeMessage: string;
  starterQuestions: string[];
  theme: string;
  avatar: string;
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export default function CustomBotCreator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [description, setDescription] = useState('');
  const [exampleIdx, setExampleIdx] = useState(0);
  const [phase, setPhase] = useState<'input' | 'designing' | 'preview'>('input');
  const [design, setDesign] = useState<DesignShape | null>(null);
  const [designDna, setDesignDna] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cycle placeholder examples while on the input screen. Full reset on close
  // so stale design state never leaks into the next open.
  useEffect(() => {
    if (!open) return;
    setPhase('input'); setDesign(null); setDesignDna(null); setError(null); setDescription('');
    setCreating(false); setRegenerating(null); setExampleIdx(0);
    const t = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 2600);
    setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearInterval(t);
  }, [open]);

  const start = async () => {
    const desc = description.trim();
    if (desc.length < 3) return;
    setPhase('designing');
    setError(null);
    try {
      const res = await db.designCustomBot(desc);
      setDesign(res.design as unknown as DesignShape);
      setDesignDna(res.designDna as Record<string, string>);
      setPhase('preview');
    } catch (e) {
      setError((e as Error).message);
      setPhase('input');
    }
  };

  const regenerate = async (section: 'name' | 'theme' | 'avatar') => {
    if (!design) return;
    setRegenerating(section);
    try {
      const res = await db.regenerateCustomSection(description.trim(), section, design as unknown as Record<string, unknown>);
      setDesign(res.design as unknown as DesignShape);
      setDesignDna(res.designDna as Record<string, string>);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRegenerating(null);
    }
  };

  const create = async () => {
    if (!design) return;
    setCreating(true);
    try {
      const bot = await db.createCustomBot(description.trim(), design as unknown as Record<string, unknown>, designDna as Record<string, unknown>);
      onClose();
      navigate(`/chat/${bot.id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create a custom bot" maxWidth={720}>
      <div className="cbc">
        {phase === 'input' && (
          <div className="cbc-input">
            <div className="cbc-hero">
              <span className="cbc-wand"><Wand2 /></span>
              <h3>Just describe it.</h3>
              <p>
                Tell the factory what you want in plain English — the AI designs the name,
                personality, prompts, theme, and starter questions for you.
              </p>
            </div>

            <div className="cbc-desc-wrap">
              <input
                ref={inputRef}
                className="cbc-desc"
                placeholder={EXAMPLES[exampleIdx]}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') start(); }}
                aria-label="Describe the bot you want"
              />
              <Sparkles className="cbc-desc-sparkle" />
            </div>

            <div className="cbc-examples">
              {EXAMPLES.slice(0, 4).map((ex) => (
                <button key={ex} className="cbc-example mono" onClick={() => setDescription(ex)}>
                  {ex.length > 34 ? ex.slice(0, 34) + '…' : ex}
                </button>
              ))}
            </div>

            {error && <p className="cbc-error">{error}</p>}

            <Button variant="primary" size="lg" className="cbc-start" onClick={start} disabled={description.trim().length < 3}>
              <Wand2 /> Design my bot <ArrowRight />
            </Button>
          </div>
        )}

        {phase === 'designing' && (
          <div className="cbc-designing">
            <motion.span
              className="cbc-designing-icon"
              animate={{ rotate: 360, scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
            >
              <Wand2 />
            </motion.span>
            <p className="mono">The foundry is designing your bot…</p>
            <div className="cbc-dots"><i /><i /><i /><i /></div>
          </div>
        )}

        {phase === 'preview' && design && (
          <div className="cbc-preview">
            <div className="cbc-preview-head">
              <div>
                <div className="eyebrow">Your custom assistant</div>
                <h3>{design.name || 'Untitled'}</h3>
                <p className="mono cbc-domain">{design.domain} · {design.subdomain}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPhase('input')}>
                <X /> Start over
              </Button>
            </div>

            <div className="cbc-preview-grid">
              {/* Preview card */}
              <div
                className="cbc-card"
                style={{
                  background: designDna?.bg || '#0c1a2a',
                  borderColor: designDna?.border,
                  color: designDna?.text,
                }}
              >
                <div className="cbc-card-top">
                  <span className="cbc-card-avatar" style={{ background: designDna?.primaryColor, color: '#fff' }}>
                    {design.avatar || initials(design.name || 'Bot')}
                  </span>
                  <div>
                    <div className="cbc-card-name">{design.name || 'Untitled'}</div>
                    <div className="cbc-card-theme mono">{design.theme} theme</div>
                  </div>
                </div>
                <p className="cbc-card-desc" style={{ color: designDna?.muted }}>{design.description}</p>
                <div className="cbc-card-starters">
                  {(design.starterQuestions || []).slice(0, 3).map((q, i) => (
                    <span key={i} className="cbc-card-starter" style={{ borderColor: designDna?.border }}>
                      {q}
                    </span>
                  ))}
                </div>
                <div className="cbc-card-foot mono" style={{ color: designDna?.muted }}>
                  {design.personality} · {design.systemPrompt?.length ?? 0} chars prompt
                </div>
              </div>

              {/* Regenerate controls */}
              <div className="cbc-controls">
                {([
                  ['name', 'Name', design.name],
                  ['theme', 'Theme', design.theme],
                  ['avatar', 'Avatar', design.avatar],
                ] as const).map(([key, label, value]) => (
                  <div className="cbc-control" key={key}>
                    <div className="cbc-control-meta">
                      <span className="cbc-control-label mono">{label}</span>
                      <span className="cbc-control-value">{value || '—'}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => regenerate(key)}
                      disabled={regenerating === key}
                      aria-label={`Regenerate ${label.toLowerCase()}`}
                    >
                      {regenerating === key ? <Loader2 className="spin" /> : <RefreshCw />}
                    </Button>
                  </div>
                ))}
                <p className="cbc-hint mono">Regenerate any part until it feels right.</p>
              </div>
            </div>

            {error && <p className="cbc-error">{error}</p>}

            <div className="cbc-preview-foot">
              <Button variant="primary" size="lg" onClick={create} disabled={creating}>
                {creating ? <Loader2 className="spin" /> : <BotIcon />}
                {creating ? 'Creating…' : 'Create bot'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
