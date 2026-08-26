import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Dices, ArrowRight, Cpu, Globe, ShieldCheck } from 'lucide-react';
import { db, type ProviderStatus } from '../services/db';
import './FactoryView.css';

export default function FactoryView() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<ProviderStatus | null>(null);
  const [botCount, setBotCount] = useState(0);

  useEffect(() => {
    db.getHealth().then(setHealth).catch(() => setHealth(null));
    db.getBots().then(bots => setBotCount(bots.length)).catch(() => {});
  }, []);

  return (
    <div className="fv-hub">
      <div className="fv-hub-particles" aria-hidden="true">
        {Array.from({ length: 16 }).map((_, i) => (
          <i key={i} style={{
            left: `${(i * 61) % 100}%`,
            animationDelay: `${(i % 8) * 0.9}s`,
            animationDuration: `${8 + (i % 5) * 2}s`,
            width: `${3 + (i % 3)}px`,
            height: `${3 + (i % 3)}px`,
          }} />
        ))}
      </div>
      <div className="container">
        <motion.div
          className="fv-hub-header"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="eyebrow">Scarlet Foundry</div>
          <h1 className="fv-title">
            What would you like<br />to <span className="accent">create</span> today?
          </h1>
          <p className="fv-lede">
            Choose your creation method. Design a custom assistant with AI,
            or manufacture hundreds of specialized bots at scale.
          </p>
        </motion.div>

        <div className="fv-hub-cards">
          {/* Custom Chatbot Card */}
          <motion.button
            className="fv-hub-card"
            onClick={() => navigate('/factory/custom')}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            whileHover={{ y: -4, scale: 1.01 }}
          >
            <div className="fv-hub-card-icon custom"><Sparkles /></div>
            <div className="fv-hub-card-content">
              <h2>Custom Chatbot</h2>
              <span className="fv-hub-card-sub mono">Scarlet Studio</span>
              <p>
                Describe your bot in plain English. AI designs everything —
                name, personality, theme, welcome message, and starter questions.
              </p>
              <div className="fv-hub-card-features">
                <span className="fv-chip mono"><Sparkles /> AI-designed</span>
                <span className="fv-chip mono"><ShieldCheck /> Custom personality</span>
                <span className="fv-chip mono"><Cpu /> Unique theme</span>
              </div>
            </div>
            <div className="fv-hub-card-cta">
              <span>Open Studio</span> <ArrowRight />
            </div>
          </motion.button>

          {/* Random Chatbots Card */}
          <motion.button
            className="fv-hub-card"
            onClick={() => navigate('/factory/random')}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            whileHover={{ y: -4, scale: 1.01 }}
          >
            <div className="fv-hub-card-icon random"><Dices /></div>
            <div className="fv-hub-card-content">
              <h2>Random Chatbots</h2>
              <span className="fv-hub-card-sub mono">Scarlet Foundry</span>
              <p>
                Manufacture specialized AI assistants at scale. Set a quantity
                and the foundry forges that many domain-bound bots instantly.
              </p>
              <div className="fv-hub-card-features">
                <span className="fv-chip mono"><Cpu /> Local-first inference</span>
                <span className="fv-chip mono"><ShieldCheck /> Domain-guarded</span>
                <span className="fv-chip mono"><Globe /> Web AI when current</span>
              </div>
            </div>
            <div className="fv-hub-card-cta">
              <span>Open Foundry</span> <ArrowRight />
            </div>
          </motion.button>
        </div>

        {/* Quick stats */}
        <motion.div
          className="fv-hub-stats mono"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <span>{botCount} bots in library</span>
          <span className="fv-hub-stats-sep">·</span>
          {health && (
            <>
              <span><i className={`dot ${health.local ? 'on' : 'off'}`} /> Local</span>
              <span><i className={`dot ${health.groq ? 'on' : 'off'}`} /> Groq</span>
              <span><i className={`dot ${health.gemini ? 'on' : 'off'}`} /> Gemini</span>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
