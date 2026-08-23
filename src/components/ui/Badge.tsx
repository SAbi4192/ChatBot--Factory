import type { ReactNode } from 'react';

type BadgeTone = 'default' | 'accent' | 'success' | 'warning' | 'error';

export function Badge({ tone = 'default', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}
