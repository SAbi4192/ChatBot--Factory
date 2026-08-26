/** Monogram avatar tile. Falls back to an emoji if `avatar` is set. */
export function Avatar({
  name,
  avatar,
  bg,
  color,
  size = 'md',
}: {
  name: string;
  avatar?: string;
  bg?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  if (avatar && avatar.trim()) {
    return (
      <span
        className={`ui-avatar ui-avatar--${size}`}
        style={{ background: bg || 'var(--bg-tertiary)', color: color || 'var(--fg)', fontSize: '1.3rem' }}
        aria-hidden="true"
      >
        {avatar}
      </span>
    );
  }
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const text = parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (
    <span
      className={`ui-avatar ui-avatar--${size}`}
      style={{ background: bg || 'var(--bg-tertiary)', color: color || 'var(--fg)' }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}
