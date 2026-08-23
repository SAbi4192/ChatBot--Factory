import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Factory, ArrowRight, Shuffle, Cpu, Globe, ShieldCheck, Boxes } from 'lucide-react';
import { db, type ProviderStatus } from '../services/db';
import './FactoryView.css';

const PRESETS = [10, 100, 500, 1000];

const STAGES = [
  { code: 'DNA', label: 'Design DNA' },
  { code: 'DMN', label: 'Domain profile' },
  { code: 'PSN', label: 'Personality matrix' },
  { code: 'PRS', label: 'Persist to store' },
];

const clamp = (n: number) => Math.max(1, Math.min(5000, Math.floor(n) || 1));

export default function FactoryView() {
  const [count, setCount] = useState<number>(1000);
  const [isGenerating, setIsGenerating] = useState(false);
  const [produced, setProduced] = useState(0);
  const [stageIdx, setStageIdx] = useState(0);
  const [existing, setExisting] = useState<number | null>(null);
  const [health, setHealth] = useState<ProviderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    db.getBots().then(b => setExisting(b.length)).catch(() => setExisting(null));
    db.getHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  const animateProduction = (target: number) =>
    new Promise<void>(resolve => {
      const duration = target > 1 ? 1700 : 900;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setProduced(Math.max(1, Math.floor(eased * target)));
        setStageIdx(Math.min(STAGES.length - 1, Math.floor(t * STAGES.length)));
        if (t < 1) requestAnimationFrame(tick);
        else { setProduced(target); resolve(); }
      };
      requestAnimationFrame(tick);
    });

  const runProduction = async (n: number, onDone: (sampleId?: string) => void) => {
    setError(null);
    setIsGenerating(true);
    setProduced(0);
    setStageIdx(0);
    try {
      const [res] = await Promise.all([db.addBots(n), animateProduction(n)]);
      await new Promise(r => setTimeout(r, 300));
      onDone(res?.sample?.id);
    } catch {
      setIsGenerating(false);
      setError('Could not reach the factory backend. Start it with the backend server, then try again.');
    }
  };

  const handleGenerate = () => {
    const n = clamp(count);
    setCount(n);
    runProduction(n, () => navigate('/library'));
  };

  const handleSurprise = () =>
    runProduction(1, (sampleId) => navigate(sampleId ? `/chat/${sampleId}` : '/library'));

  // ---- Generation (production run) screen ----
  if (isGenerating) {
    const target = Math.max(produced, 1);
    const pct = Math.min(100, (produced / (count || 1)) * 100);
    return (
      <div className="foundry-bg fv-center">
        <div className="fv-run">
          <div className="eyebrow">Production run</div>
          <div className="fv-run-counter mono">
            <span className="fv-run-now">{produced.toLocaleString()}</span>
            <span className="fv-run-sep">/</span>
            <span className="fv-run-target">{count.toLocaleString()}</span>
          </div>
          <div className="fv-run-label">specialized assistants manufactured</div>

          <div className="fv-rail"><div className="fv-rail-fill" style={{ width: `${pct}%` }} /></div>

          <ul className="fv-stages">
            {STAGES.map((s, i) => (
              <li key={s.code} className={i < stageIdx ? 'done' : i === stageIdx ? 'active' : ''}>
                <span className="fv-stage-code mono">{s.code}</span>
                <span className="fv-stage-name">{s.label}</span>
                <span className="fv-stage-state mono">{i < stageIdx ? 'OK' : i === stageIdx ? '···' : ''}</span>
              </li>
            ))}
          </ul>
          <div className="fv-run-note mono">ONE ENGINE · {target > 1 ? 'BULK TRANSACTION' : 'SINGLE UNIT'}</div>
        </div>
      </div>
    );
  }

  // ---- Idle / console screen ----
  return (
    <div className="foundry-bg">
      <header className="brandbar">
        <div className="wordmark">
          <span className="mark"><Factory /></span>
          Chatbot Factory
          <span className="sub">universal engine · v4</span>
        </div>
        <div className="fv-topright">
          {health && (
            <div className="fv-providers mono" title="AI providers detected by the backend">
              <span><i className={`dot ${health.local ? 'on' : 'off'}`} /> LOCAL</span>
              <span><i className={`dot ${health.groq ? 'on' : 'off'}`} /> GROQ</span>
              <span><i className={`dot ${health.gemini ? 'on' : 'off'}`} /> GEMINI</span>
            </div>
          )}
          {existing != null && existing > 0 && (
            <button className="btn btn-ghost" onClick={() => navigate('/library')}>
              <Boxes /> Library · {existing.toLocaleString()}
            </button>
          )}
        </div>
      </header>

      <main className="fv-main container">
        <section className="fv-hero">
          <div className="eyebrow">Universal bot foundry</div>
          <h1 className="fv-title">
            Manufacture specialized<br />AI assistants <span className="accent">at scale</span>.
          </h1>
          <p className="fv-lede">
            One frontend, one backend, one local model. Set a quantity and the foundry
            procedurally forges that many domain-bound assistants — each with its own
            specialty, personality, guardrails, and visual identity.
          </p>
          <div className="fv-features">
            <span className="fv-chip mono"><Cpu /> Local-first inference</span>
            <span className="fv-chip mono"><ShieldCheck /> Domain-guarded</span>
            <span className="fv-chip mono"><Globe /> Web AI when current</span>
          </div>
        </section>

        <section className="fv-console" aria-label="Production console">
          <div className="fv-console-head">
            <span className="mono">PRODUCTION QUANTITY</span>
            <span className="mono fv-range">1 – 5000</span>
          </div>

          <div className="fv-console-body">
            <div className="fv-qty">
              <input
                type="number"
                className="fv-qty-input mono"
                value={count}
                min={1}
                max={5000}
                onChange={(e) => setCount(parseInt(e.target.value) || 0)}
                onBlur={() => setCount(c => clamp(c))}
                aria-label="Number of chatbots to generate"
              />
              <span className="fv-qty-unit mono">units</span>
            </div>

            <div className="fv-presets">
              {PRESETS.map(p => (
                <button
                  key={p}
                  className={`fv-preset mono ${count === p ? 'sel' : ''}`}
                  onClick={() => setCount(p)}
                >
                  {p.toLocaleString()}
                </button>
              ))}
            </div>

            <button className="btn btn-primary fv-produce" onClick={handleGenerate}>
              Produce {clamp(count).toLocaleString()} <ArrowRight />
            </button>

            <div className="fv-or"><span>or</span></div>

            <button className="btn btn-ghost fv-forge" onClick={handleSurprise}>
              <Shuffle /> Forge one at random
            </button>

            {error && <div className="fv-error mono">{error}</div>}
          </div>
        </section>
      </main>
    </div>
  );
}
