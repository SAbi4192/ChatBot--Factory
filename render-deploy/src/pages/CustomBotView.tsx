import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Wand2, RefreshCw, ArrowRight, Loader2, ChevronLeft, Bot as BotIcon } from 'lucide-react';
import { db } from '../services/db';
import { toast } from 'sonner';
import Confetti from '../components/ui/Confetti';
import './CustomBotView.css';

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

export default function CustomBotView() {
  const navigate = useNavigate();
  const [description, setDescription] = useState('');
  const [exampleIdx, setExampleIdx] = useState(0);
  const [phase, setPhase] = useState<'input' | 'designing' | 'preview'>('input');
  const [design, setDesign] = useState<DesignShape | null>(null);
  const [designDna, setDesignDna] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 2600);
    setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearInterval(t);
  }, []);

  const startDesign = async () => {
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
      toast.error((e as Error).message);
    } finally {
      setRegenerating(null);
    }
  };

  const createBot = async () => {
    if (!design || !designDna) return;
    setCreating(true);
    try {
      const bot = await db.createCustomBot(description.trim(), design as unknown as Record<string, unknown>, designDna);
      setCelebrating(true);
      toast.success(`${design.name} created! 🎉`);
      setTimeout(() => navigate(`/chat/${bot.id}`), 1200);
    } catch (e) {
      toast.error((e as Error).message);
      setCreating(false);
    }
  };

  return (
    <div className="cbv-page">
      <Confetti active={celebrating} />
      <div className="fv-back-link">
        <Link to="/factory"><ChevronLeft /> Back to Creation Hub</Link>
      </div>

      <main className="cbv-main container">
        {/* Left: Hero */}
        <section className="fv-hero">
          <div className="eyebrow">Scarlet Studio</div>
          <h1 className="fv-title">
            Design your perfect<br />AI <span className="accent">assistant</span>.
          </h1>
          <p className="fv-lede">
            Describe your chatbot in plain English and Scarlet's AI will design
            everything — name, personality, theme, welcome message, and starter
            questions. No configuration needed.
          </p>
          <div className="fv-features">
            <span className="fv-chip mono"><Sparkles /> AI-designed</span>
            <span className="fv-chip mono"><Wand2 /> Custom personality</span>
            <span className="fv-chip mono"><BotIcon /> Unique identity</span>
          </div>
        </section>

        {/* Right: Console */}
        <section className="fv-console" aria-label="Design console">
          <div className="fv-console-head">
            <span className="mono">DESIGN CONSOLE</span>
            <span className="mono fv-range">AI-POWERED</span>
          </div>

          <div className="fv-console-body">
            <AnimatePresence mode="wait">
              {phase === 'input' && (
                <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <label className="cbv-label">What kind of bot do you want?</label>
                  <input
                    ref={inputRef}
                    className="cbv-input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && startDesign()}
                    placeholder={`e.g. "${EXAMPLES[exampleIdx]}"`}
                  />
                  <div className="cbv-examples">
                    <span className="cbv-examples-label">💡 Try:</span>
                    {EXAMPLES.slice(0, 3).map((ex) => (
                      <button key={ex} className="cbv-example-chip" onClick={() => setDescription(ex)}>
                        {ex}
                      </button>
                    ))}
                  </div>
                  {error && <div className="fv-error mono">{error}</div>}
                  <button className="btn btn-primary fv-produce" onClick={startDesign} disabled={description.trim().length < 3}>
                    <Sparkles /> Design My Bot
                  </button>
                </motion.div>
              )}

              {phase === 'designing' && (
                <motion.div key="designing" className="cbv-designing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Loader2 className="cbv-spinner" />
                  <p>Scarlet is designing your bot…</p>
                  <p className="cbv-designing-sub mono">Generating name · personality · theme · prompts</p>
                </motion.div>
              )}

              {phase === 'preview' && design && (
                <motion.div key="preview" className="cbv-preview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="cbv-preview-header">
                    <div className="cbv-preview-avatar" style={{ background: designDna?.accent || 'var(--accent)' }}>
                      {design.avatar || design.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3>{design.name}</h3>
                      <span className="mono cbv-preview-domain">{design.domain} · {design.subdomain}</span>
                    </div>
                    <button className="cbv-regen" onClick={() => regenerate('name')} disabled={regenerating === 'name'} title="Regenerate name">
                      {regenerating === 'name' ? <Loader2 className="spin" /> : <RefreshCw />}
                    </button>
                  </div>

                  <div className="cbv-preview-section">
                    <label>Personality</label>
                    <p>{design.personality}</p>
                  </div>

                  <div className="cbv-preview-section">
                    <label>Welcome Message</label>
                    <p>{design.welcomeMessage}</p>
                  </div>

                  <div className="cbv-preview-section">
                    <label>Starter Questions</label>
                    <div className="cbv-starters">
                      {design.starterQuestions?.map((q) => <span key={q} className="cbv-starter">{q}</span>)}
                    </div>
                  </div>

                  <div className="cbv-preview-actions">
                    <button className="btn btn-ghost" onClick={() => { setPhase('input'); setDesign(null); }}>
                      Start Over
                    </button>
                    <button className="btn btn-primary" onClick={createBot} disabled={creating}>
                      {creating ? <Loader2 className="spin" /> : <ArrowRight />}
                      {creating ? 'Creating…' : 'Create Bot'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>
    </div>
  );
}
