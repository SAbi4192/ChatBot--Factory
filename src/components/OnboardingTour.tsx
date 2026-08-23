import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Factory, Wand2, LayoutDashboard, X } from 'lucide-react';

const STEPS = [
  { icon: LayoutDashboard, title: 'Welcome to your factory floor', body: 'This dashboard shows every bot, conversation and provider at a glance.' },
  { icon: Factory, title: 'Forge bots at scale', body: 'Open the Factory to manufacture dozens — or thousands — of domain-specialized assistants in one run.' },
  { icon: Wand2, title: 'Or just describe one', body: 'Use the custom creator: type what you want in plain English and the AI designs the whole bot for you.' },
];

/** 3-step first-run onboarding tour (Checkpoint 10 addition). */
export default function OnboardingTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') { if (step < STEPS.length - 1) setStep(s => s + 1); else onClose(); }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, step, onClose]);

  if (!open) return null;
  const s = STEPS[step];

  return (
    <motion.div
      className="ui-modal-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ zIndex: 200 }}
    >
      <motion.div
        className="ui-modal"
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        style={{ maxWidth: 420 }}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome tour"
      >
        <div style={{ padding: '1.6rem 1.6rem 1.3rem', textAlign: 'center' }}>
          <button className="ui-modal-close" onClick={onClose} aria-label="Skip tour" style={{ position: 'absolute', top: 14, right: 14 }}>
            <X />
          </button>
          <motion.span
            key={step}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            style={{ display: 'inline-grid', placeItems: 'center', width: 64, height: 64, borderRadius: 18, background: 'var(--accent-subtle)', border: '1px solid var(--signal-line)', color: 'var(--accent)', marginBottom: '1rem' }}
          >
            <s.icon style={{ width: 28, height: 28 }} />
          </motion.span>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.15rem', marginBottom: '0.5rem' }}>{s.title}</h3>
          <p style={{ color: 'var(--fg-dim)', fontSize: '0.88rem', lineHeight: 1.65 }}>{s.body}</p>

          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', margin: '1.2rem 0 0.4rem' }}>
            {STEPS.map((_, i) => (
              <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i === step ? 'var(--accent)' : 'var(--bg-quaternary)', transition: 'background 0.2s' }} />
            ))}
          </div>
        </div>
        <div className="ui-modal-foot" style={{ justifyContent: 'space-between' }}>
          <span className="mono" style={{ fontSize: '0.64rem', color: 'var(--fg-faint)' }}>{step + 1} / {STEPS.length}</span>
          <button
            className="ui-btn ui-btn--primary ui-btn--sm"
            onClick={() => (step < STEPS.length - 1 ? setStep(s => s + 1) : onClose())}
          >
            {step < STEPS.length - 1 ? 'Next' : 'Let\'s go'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
