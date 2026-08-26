import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Cpu, Globe, ShieldCheck, ChevronLeft } from 'lucide-react';
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

export default function RandomBotView() {
  const [count, setCount] = useState<number>(1000);
  const [isGenerating, setIsGenerating] = useState(false);
  const [produced, setProduced] = useState(0);
  const [stageIdx, setStageIdx] = useState(0);
  const [health, setHealth] = useState<ProviderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    db.getHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  const runProduction = async (n: number, onDone: (sampleId?: string) => void) => {
    setError(null);
    setIsGenerating(true);
    setProduced(0);
    setStageIdx(0);
    let actual = 0;
    let displayed = 0;
    let rafId = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      displayed = Math.min(actual, displayed + Math.max(1, Math.ceil((actual - displayed) * 0.12)));
      setProduced(displayed);
      setStageIdx(Math.min(STAGES.length - 1, Math.floor((displayed / Math.max(1, n)) * STAGES.length)));
      rafId = requestAnimationFrame(tick);
    };

    try {
      rafId = requestAnimationFrame(tick);
      const res = await db.addBots(n, (soFar) => { actual = soFar; });
      actual = n;
      while (displayed < n && !stopped) {
        await new Promise(r => setTimeout(r, 40));
      }
      stopped = true;
      cancelAnimationFrame(rafId);
      setProduced(n);
      setStageIdx(STAGES.length - 1);
      await new Promise(r => setTimeout(r, 300));
      onDone(res?.sample?.id);
    } catch {
      stopped = true;
      cancelAnimationFrame(rafId);
      setIsGenerating(false);
      setError('Could not reach the factory backend. Start it with the backend server, then try again.');
    }
  };

  const handleGenerate = () => {
    const n = clamp(count);
    setCount(n);
    runProduction(n, () => navigate('/library'));
  };

  // ---- Production run screen ----
  if (isGenerating) {
    const pct = Math.min(100, (produced / (count || 1)) * 100);
    return (
      <div className="fv-center">
        <div className="fv-run">
          <div className="eyebrow">Production run</div>
          <div className="fv-run-counter mono">
            <span className="fv-run-now">{produced.toLocaleString()}</span>
            <span className="fv-run-sep">/</span>
            <span className="fv-run-target">{clamp(count).toLocaleString()}</span>
          </div>
          <div className="fv-run-label">bots forged and counting…</div>
          <div className="fv-rail"><div className="fv-rail-fill" style={{ width: `${pct}%` }} /></div>
          <ul className="fv-stages">
            {STAGES.map((s, i) => (
              <li key={s.code} className={i === stageIdx ? 'active' : i < stageIdx ? 'done' : ''}>
                <span className="fv-stage-code mono">{s.code}</span>
                <span className="fv-stage-name">{s.label}</span>
                <span className="fv-stage-state mono">{i < stageIdx ? '✓' : i === stageIdx ? 'RUNNING' : 'IDLE'}</span>
              </li>
            ))}
          </ul>
          <div className="fv-run-note mono">SCARLET FOUNDRY · DO NOT CLOSE THIS TAB</div>
        </div>
      </div>
    );
  }

  // ---- Idle / console screen ----
  return (
    <div>
      <div className="fv-back-link">
        <Link to="/factory"><ChevronLeft /> Back to Creation Hub</Link>
      </div>
      <main className="fv-main container">
        <section className="fv-hero">
          <div className="eyebrow">Scarlet Foundry</div>
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
          {health && (
            <div className="fv-providers mono" style={{ marginTop: '1.2rem' }} title="AI providers detected by the backend">
              <span><i className={`dot ${health.local ? 'on' : 'off'}`} /> LOCAL</span>
              <span><i className={`dot ${health.groq ? 'on' : 'off'}`} /> GROQ</span>
              <span><i className={`dot ${health.gemini ? 'on' : 'off'}`} /> GEMINI</span>
            </div>
          )}
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

            {error && <div className="fv-error mono">{error}</div>}
          </div>
        </section>
      </main>
    </div>
  );
}
