import { useMemo } from 'react';

const COLORS = ['#F5B13D', '#FFC96B', '#A855F7', '#EC4899', '#22D3EE', '#34D399', '#F87171', '#60A5FA'];

/**
 * Lightweight confetti burst — 50 CSS-animated particles with random
 * positions, colors, and fall physics. No library, pure CSS keyframes.
 */
export default function Confetti({ active = true }: { active?: boolean }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 50 }, (_, i) => ({
        id: i,
        left: `${(Math.random() * 100).toFixed(2)}%`,
        delay: `${(Math.random() * 0.4).toFixed(2)}s`,
        duration: `${(1.4 + Math.random() * 1.4).toFixed(2)}s`,
        size: `${(6 + Math.random() * 6).toFixed(1)}px`,
        color: COLORS[i % COLORS.length],
        rotate: `${(Math.random() * 360).toFixed(0)}deg`,
      })),
    []
  );

  if (!active) return null;

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: p.left,
            animationDelay: p.delay,
            animationDuration: p.duration,
            width: p.size,
            height: p.size,
            background: p.color,
            '--confetti-rotate': p.rotate,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
