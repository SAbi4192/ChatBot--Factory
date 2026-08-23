import { useEffect, useRef, useState } from 'react';

interface StatCardProps {
  value: number;
  label: string;
  format?: (n: number) => string;
  delay?: number;
}

/** Stat card with an animated counter that eases to the final value. */
export function StatCard({ value, label, format, delay = 0 }: StatCardProps) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const start = performance.now() + delay * 1000;
    let raf = 0;
    const tick = (now: number) => {
      if (now < start) { raf = requestAnimationFrame(tick); return; }
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    rafRef.current = raf;
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, delay]);

  const fmt = format ?? ((n: number) => n.toLocaleString());

  return (
    <div className="ui-stat">
      <div className="ui-stat-value">{fmt(display)}</div>
      <div className="ui-stat-label">{label}</div>
    </div>
  );
}
