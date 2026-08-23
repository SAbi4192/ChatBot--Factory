export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

/** Card-shaped skeleton used in grids while data loads. */
export function SkeletonCard() {
  return (
    <div className="ui-card" aria-hidden="true">
      <div className="skeleton" style={{ width: 46, height: 46, borderRadius: 11, marginBottom: 14 }} />
      <div className="skeleton" style={{ width: '60%', height: 16, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: '35%', height: 10, marginBottom: 14 }} />
      <div className="skeleton" style={{ width: '100%', height: 12, marginBottom: 6 }} />
      <div className="skeleton" style={{ width: '85%', height: 12, marginBottom: 18 }} />
      <div className="skeleton" style={{ width: '40%', height: 10 }} />
    </div>
  );
}
