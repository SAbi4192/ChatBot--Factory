import { useState } from 'react';
import type { ReactNode } from 'react';

/** Lightweight CSS tooltip: hover/focus a child, show a label above it. */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [id] = useState(() => `tip-${Math.random().toString(36).slice(2, 8)}`);
  return (
    <span className="ui-tip" role="group" aria-describedby={id}>
      {children}
      <span className="ui-tip-bubble" id={id} role="tooltip">
        {label}
      </span>
    </span>
  );
}
