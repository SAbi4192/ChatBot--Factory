import { useEffect, useState } from 'react';
import './LandingView.css';
import { getTheme, toggleTheme, type Theme } from '../utils/theme';

/* ------------------------------------------------------------------ */
/*  Live IST clock — factory always knows the time                     */
/* ------------------------------------------------------------------ */
function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
  return <span className="lp-clock">{time} IST</span>;
}

/* ------------------------------------------------------------------ */
/*  Theme toggle — sun/moon, same scarlet:theme store as the console   */
/* ------------------------------------------------------------------ */
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme());
  return (
    <button
      className="lp-theme-btn"
      onClick={() => setTheme(toggleTheme())}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Factory log ticker — lines stamped out, one every couple seconds   */
/* ------------------------------------------------------------------ */
const LOG_LINES = [
  '[FORGE] run #042 — requested: 250 bots · one transaction',
  '[STAMP] Sous-Chef Sam · culinary · guard 5/5 ✓',
  '[STAMP] DocWhiz · medical · kb: 12 docs cited ✓',
  '[STAMP] LegalLena · law · persona: precise, warm ✓',
  '[GUARD] blocked "who is Elon Musk?" → L2 · zero overlap',
  '[GUARD] "I got my sweet tooth at 8" → warm reinterpret ✓',
  '[ROUTE] local GGUF · 38 tok/s · streaming ✓',
  '[ROUTE] current-info? → web AI · cited sources ✓',
  '[VOICE] hi-IN reply spoken back · தமிழ் ready ✓',
  '[ANALYTICS] sentiment 7-day trend · CSAT 4.6 ★',
];

function LogTicker() {
  const [lines, setLines] = useState<string[]>(LOG_LINES.slice(0, 4));
  useEffect(() => {
    let i = 4;
    const t = setInterval(() => {
      setLines((prev) => [...prev.slice(-5), LOG_LINES[i % LOG_LINES.length]]);
      i += 1;
    }, 2100);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="lp-log" aria-hidden="true">
      <div className="lp-log-bar">
        <span /><span /><span />
        <em>scarlet · forge.log</em>
      </div>
      <div className="lp-log-body">
        {lines.map((l, idx) => (
          <div key={`${l}-${idx}`} className="lp-log-line">{l}</div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Conveyor — Design DNA bots sliding off the line                    */
/* ------------------------------------------------------------------ */
const CONVEYOR_BOTS = [
  { name: 'Sous-Chef Sam', domain: 'culinary', color: '#F5B13D', emoji: '🍳', tag: 'guard 5/5' },
  { name: 'DocWhiz', domain: 'medical', color: '#4ADE80', emoji: '🩺', tag: 'kb · 12 docs' },
  { name: 'LegalLena', domain: 'law', color: '#60A5FA', emoji: '⚖️', tag: 'persona: precise' },
  { name: 'ProfitPilot', domain: 'finance', color: '#C084FC', emoji: '📈', tag: 'slots on' },
  { name: 'CodeCritic', domain: 'dev-edu', color: '#F87171', emoji: '🧑‍💻', tag: 'streaming' },
  { name: 'ZenithGuru', domain: 'wellness', color: '#2DD4BF', emoji: '🧘', tag: 'voice in/out' },
];

function Conveyor() {
  const row = [...CONVEYOR_BOTS, ...CONVEYOR_BOTS];
  return (
    <div className="lp-conveyor" aria-hidden="true">
      <div className="lp-conveyor-track">
        {row.map((b, i) => (
          <div className="lp-bot-card" style={{ ['--bot' as string]: b.color, animationDelay: `${-i * 3.4}s` }} key={i}>
            <div className="lp-bot-top">
              <span className="lp-bot-ava">{b.emoji}</span>
              <span className="lp-bot-name">{b.name}</span>
            </div>
            <div className="lp-bot-meta">domain · {b.domain}</div>
            <div className="lp-bot-tag">{b.tag}</div>
            <div className="lp-bot-dna">
              <i /><i /><i /><i />
            </div>
          </div>
        ))}
      </div>
      <div className="lp-conveyor-rail"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Domain Guard live demo — typed scenes, looping                     */
/* ------------------------------------------------------------------ */
type Scene = { q: string; layer: string; layerNote: string; reply: string; ok?: boolean };
const SCENES: Scene[] = [
  {
    q: 'Who is Donald Trump?',
    layer: 'L2 · EVIDENCE',
    layerNote: 'zero domain overlap → refuse',
    reply: "I'm all about the kitchen! Ask me for a recipe and I'm yours. 🍳",
  },
  {
    q: 'I got my sweet tooth when I was eight.',
    layer: 'L4 · CONTEXT',
    layerNote: 'personal story → warm reinterpret',
    reply: 'Eight! That explains the dessert first attitude. Crème brûlée or kulfi tonight?',
    ok: true,
  },
  {
    q: 'Write me a poem about monsoons.',
    layer: 'L3 · REDIRECT',
    layerNote: 'off-domain → in-character bounce',
    reply: 'Poetry isn\'t my pot — but a monsoon special pakora recipe? That I can do. 🌧️',
  },
];

function GuardDemo() {
  const [scene, setScene] = useState(0);
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<'typing' | 'guard' | 'reply'>('typing');
  const [replyTyped, setReplyTyped] = useState('');

  useEffect(() => {
    const s = SCENES[scene % SCENES.length];
    let i = 0;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));

    setTyped('');
    setReplyTyped('');
    setPhase('typing');

    const step = () => {
      if (!alive) return;
      if (i <= s.q.length) {
        setTyped(s.q.slice(0, i));
        i += 1;
        later(step, 38);
      } else {
        setPhase('guard');
        later(() => setPhase('reply'), 900);
        later(() => {
          let j = 0;
          const rstep = () => {
            if (!alive) return;
            if (j <= s.reply.length) {
              setReplyTyped(s.reply.slice(0, j));
              j += 1;
              timers.push(setTimeout(rstep, 16));
            } else {
              later(() => setScene((v) => v + 1), 2600);
            }
          };
          rstep();
        }, 950);
      }
    };
    later(step, 500);

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [scene]);

  const s = SCENES[scene % SCENES.length];
  return (
    <div className="lp-guard-demo">
      <div className="lp-guard-head">
        <span className="lp-guard-bot">🍳 Sous-Chef Sam</span>
        <span className="lp-guard-sub">domain: culinary · strictness: high</span>
      </div>
      <div className="lp-guard-body">
        <div className="lp-msg lp-msg-user"><span>{typed}</span><i className="lp-caret" /></div>
        <div className={`lp-guard-chip ${phase !== 'typing' ? 'on' : ''} ${s.ok ? 'pass' : ''}`}>
          <b>{s.layer}</b><em>{s.layerNote}</em>
        </div>
        {phase === 'reply' && (
          <div className="lp-msg lp-msg-bot"><span>{replyTyped}</span><i className="lp-caret amber" /></div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ScrollCraft engine — reveal + count-up + scroll-linked progress    */
/*  Sets --doc-sp (0..1 whole page) on .lp and --sp (0..1 per element) */
/*  on every [data-sp] node; CSS turns those into motion.              */
/* ------------------------------------------------------------------ */
function useScrollFx() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.lp');

    const els = document.querySelectorAll('.lp-reveal');
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('in')),
      { threshold: 0.14 },
    );
    els.forEach((el) => io.observe(el));

    /* stat counters — count up the first time they are seen */
    const counters = document.querySelectorAll<HTMLElement>('[data-count]');
    const cio = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          cio.unobserve(e.target);
          const el = e.target as HTMLElement;
          const target = Number(el.dataset.count || '0');
          const t0 = performance.now();
          const dur = 1300;
          const tick = (t: number) => {
            const p = Math.min(1, (t - t0) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            const v = Math.round(target * eased);
            el.textContent = target >= 1000 ? v.toLocaleString('en-US') : String(v);
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.4 },
    );
    counters.forEach((el) => cio.observe(el));

    /* scroll-linked progress custom properties */
    let raf = 0;
    const spEls = Array.from(document.querySelectorAll<HTMLElement>('[data-sp]'));
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      const y = window.scrollY;
      if (root) {
        const total = document.documentElement.scrollHeight - vh;
        root.style.setProperty('--doc-sp', total > 0 ? String(Math.min(1, y / total)) : '0');
      }
      for (const el of spEls) {
        const r = el.getBoundingClientRect();
        let p: number;
        if (el.dataset.sp === 'exit') {
          p = -r.top / Math.max(1, r.height * 0.85);
        } else {
          p = (vh - r.top) / (vh + r.height);
        }
        el.style.setProperty('--sp', String(Math.max(0, Math.min(1, p))));
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      io.disconnect();
      cio.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      </svg>
    ),
    title: 'Procedural Forge',
    body: 'Describe a domain, pull the lever, get a bot — name, personality, prompts, theme and Design DNA generated fresh. One run can stamp out 5,000 specialists in a single transaction.',
    chip: '1 → 5000 per run',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z" /><path d="m9 12 2 2 4-4" />
      </svg>
    ),
    title: 'Domain Guard · 5 layers',
    body: 'Greetings → evidence → redirect → context → LLM classifier. Off-topic questions get a polite, in-character refusal — and the explainability panel shows exactly which layer caught it.',
    chip: 'every message checked',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      </svg>
    ),
    title: 'RAG Knowledge Base',
    body: 'Feed it PDFs, DOCX, spreadsheets, JSON — or let it crawl a URL. Every answer arrives with cited sources, so the bot explains where its knowledge came from.',
    chip: 'cited answers',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" /><path d="M12 19h4.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H12" />
      </svg>
    ),
    title: 'Hybrid AI Routing',
    body: 'A local GGUF model answers by default — fully offline. When a question needs today\'s news, it routes to web-enabled cloud AI. If every provider is down, it still degrades gracefully.',
    chip: 'local-first',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 17v4" />
      </svg>
    ),
    title: 'Voice, in & out',
    body: 'Speak your message, hear the reply read aloud — English plus தமிழ், తెలుగు, हिन्दी, മലയാളം, ಕನ್ನಡ and 日本語, with streaming tokens as it thinks.',
    chip: '7 languages',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="m7 14 4-4 4 4 5-6" />
      </svg>
    ),
    title: 'Analytics that matter',
    body: 'Sentiment trends, response-time histograms, provider donuts and CSAT — live dashboards with 5-second polling and one-click CSV / SVG export for your report.',
    chip: 'export ready',
  },
];

const PIPELINE = [
  { n: '01', t: 'Describe', d: 'Type a domain in plain English — or bulk-generate 250 at once.' },
  { n: '02', t: 'Generate', d: 'Scarlet forges the bot: persona, prompts, guardrails, visual DNA.' },
  { n: '03', t: 'Guard', d: 'Five layers vet every message before the model ever sees it.' },
  { n: '04', t: 'Converse', d: 'Streaming chat with voice, memory, slots and human handoff.' },
  { n: '05', t: 'Measure', d: 'Sentiment, CSAT, heatmaps — export straight into your deck.' },
];

export default function LandingView() {
  useScrollFx();
  return (
    <div className="lp">
      <div className="lp-ambient" aria-hidden="true">
        <i className="lp-glow a" />
        <i className="lp-glow b" />
      </div>
      <div className="lp-progress" aria-hidden="true" />

      <header className="lp-nav">
        <a className="lp-logo" href="/home">
          <span className="lp-logo-dot" />
          SCARLET
          <em>chatbot factory</em>
        </a>
        <nav className="lp-links" aria-label="Primary">
          <a className="lp-nlink" href="#features"><sup>01</sup> Features</a>
          <a className="lp-nlink" href="#guard"><sup>02</sup> Guard</a>
          <a className="lp-nlink" href="#pipeline"><sup>03</sup> Pipeline</a>
          <a className="lp-nlink" href="#tech"><sup>04</sup> Tech</a>
        </nav>
        <div className="lp-nav-right">
          <LiveClock />
          <ThemeToggle />
          <a className="lp-nav-cta" href="/login">Console</a>
        </div>
      </header>

      <section className="lp-hero" data-sp="exit">
        <p className="lp-hero-kicker rv-up">TRAINING &amp; PLACEMENT · FULL-STACK AI FACTORY</p>
        <div className="lp-hero-main">
          <div className="lp-wordmark-wrap">
            <h1 className="lp-wordmark rv-up d1">
              Scarlet<span className="lp-dot-accent">.</span>
            </h1>
            <p className="lp-wordmark-sub rv-up d2">Chatbot&nbsp;Factory</p>
          </div>
          <div className="lp-hero-side">
            <p className="lp-hero-lede rv-right d2">
              Domain-specialized chatbots, forged on demand — one or five thousand — each with its own
              personality, guardrails and design DNA. Served entirely by a single local AI.
            </p>
            <div className="lp-hero-actions rv-right d3">
              <a className="lp-cta big" href="/login"><span>launch the console</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
              </a>
            </div>
          </div>
        </div>
        <div className="lp-hero-foot rv-up d3">
          <div className="lp-live-status"><i className="lp-dot" />factory online · local-first</div>
          <div className="lp-stats">
            <div><b data-count="5000">5,000</b><span>bots · one bulk transaction</span></div>
            <div><b data-count="5">5</b><span>layers of Domain Guard</span></div>
            <div><b data-count="7">7</b><span>languages, voice in &amp; out</span></div>
            <div><b>0</b><span>cloud required to run</span></div>
          </div>
        </div>
        <div className="lp-scroll-cue" aria-hidden="true">
          <span>scroll</span>
          <i />
        </div>
      </section>

      <section className="lp-marquee" aria-hidden="true">
        <div className="lp-marquee-track">
          {Array.from({ length: 2 }).map((_, k) => (
            <span key={k}>
              procedural generation · domain guard · RAG citations · SSE streaming · voice in &amp; out · sentiment analytics · JWT multi-tenancy · embeddable widget · flow builder · human handoff ·&nbsp;
            </span>
          ))}
        </div>
      </section>

      <section className="lp-live" id="live">
        <div className="lp-sec-head lp-reveal">
          <span className="lp-kicker">LIVE ON THE FACTORY FLOOR</span>
          <h2>Forging right now.</h2>
        </div>
        <div className="lp-live-grid lp-reveal">
          <LogTicker />
          <Conveyor />
        </div>
      </section>

      <section className="lp-features" id="features">
        <span className="lp-bg-num" data-sp aria-hidden="true">01</span>
        <div className="lp-sec-head lp-reveal">
          <span className="lp-kicker">WHAT'S INSIDE</span>
          <h2>Built like a product,<br />not a project.</h2>
        </div>
        <div className="lp-grid">
          {FEATURES.map((f) => (
            <article className="lp-card lp-reveal" key={f.title}>
              <div className="lp-card-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <span className="lp-chip">{f.chip}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-guard" id="guard">
        <span className="lp-bg-num" data-sp aria-hidden="true">02</span>
        <div className="lp-sec-head lp-reveal">
          <span className="lp-kicker">THE SIGNATURE MOVE</span>
          <h2>A bot that knows<br />what it doesn't know.</h2>
          <p className="lp-sec-sub">
            Every message passes five gates before the model answers. Watch a culinary bot bounce
            celebrities, honor a childhood memory, and redirect poetry — live, in-character.
          </p>
        </div>
        <div className="lp-guard-wrap lp-reveal">
          <GuardDemo />
          <ul className="lp-layers">
            <li data-sp><b>L1</b> Social · greetings &amp; small talk pass straight through</li>
            <li data-sp><b>L2</b> Evidence · zero domain vocabulary overlap → refuse</li>
            <li data-sp><b>L3</b> Redirect · off-topic but harmless → in-character bounce</li>
            <li data-sp><b>L4</b> Context · personal stories → warm reinterpretation</li>
            <li data-sp><b>L5</b> Classifier · the hard cases go to the local LLM judge</li>
          </ul>
        </div>
      </section>

      <section className="lp-pipeline" id="pipeline">
        <span className="lp-bg-num" data-sp aria-hidden="true">03</span>
        <div className="lp-sec-head lp-reveal">
          <span className="lp-kicker">HOW IT RUNS</span>
          <h2>Describe. Forge. Ship.</h2>
        </div>
        <ol className="lp-steps" data-sp>
          {PIPELINE.map((s) => (
            <li className="lp-reveal" data-sp key={s.n}>
              <span className="lp-step-n">{s.n}</span>
              <h4>{s.t}</h4>
              <p>{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-tech" id="tech">
        <span className="lp-bg-num" data-sp aria-hidden="true">04</span>
        <div className="lp-tech-card lp-reveal">
          <span className="lp-kicker">UNDER THE HOOD</span>
          <h2>One machine,<br />every layer accounted for.</h2>
          <div className="lp-tech-grid">
            <div><b>Frontend</b><span>React 19 · Vite · Framer Motion · Recharts</span></div>
            <div><b>Backend</b><span>Express 5 · Helmet · Zod · rate limiting</span></div>
            <div><b>Data</b><span>Prisma ORM · SQLite · Postgres-ready</span></div>
            <div><b>AI</b><span>Local GGUF (llama.cpp) · Groq · Gemini</span></div>
            <div><b>Security</b><span>JWT rotation · RBAC · PII redaction</span></div>
            <div><b>Deploy</b><span>Docker Compose · Render · one script</span></div>
          </div>
        </div>
      </section>

      <section className="lp-final lp-reveal" data-sp>
        <h2>Pull the lever.<br /><span className="lp-shine">Your factory is waiting.</span></h2>
        <div className="lp-hero-actions center">
          <a className="lp-cta big" href="/login"><span>launch the console</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
          </a>
        </div>
      </section>

      <footer className="lp-footer">
        <span>Scarlet — Chatbot Factory · forged by Abishek</span>
        <span className="lp-foot-dim">React 19 · Express 5 · Prisma · SQLite · Local-first AI</span>
      </footer>
    </div>
  );
}
