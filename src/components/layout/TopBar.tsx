import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Search, Plus } from 'lucide-react';

const CRUMBS: Record<string, string> = {
  '/': 'Dashboard',
  '/factory': 'Factory',
  '/library': 'Library',
  '/chat': 'Chat',
  '/analytics': 'Analytics',
  '/templates': 'Templates',
  '/settings': 'Settings',
};

interface TopBarProps {
  onOpenSearch: () => void;
}

export function TopBar({ onOpenSearch }: TopBarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const seg = location.pathname.split('/').filter(Boolean);
  const root = `/${seg[0] ?? ''}`;
  const rootLabel = CRUMBS[root] || 'Dashboard';

  return (
    <header className="app-topbar">
      <nav className="app-breadcrumbs" aria-label="Breadcrumb">
        <span>{rootLabel}</span>
        {seg.length > 1 && (
          <>
            <ChevronRight />
            <span className="crumb-current">{seg[1]}</span>
          </>
        )}
      </nav>

      <button className="app-search-btn" onClick={onOpenSearch} aria-label="Search (Ctrl+K)">
        <Search />
        <span className="hide-mobile">Search bots, conversations…</span>
        <span className="kbd-hint">Ctrl K</span>
      </button>

      <button
        className="ui-btn ui-btn--primary ui-btn--sm"
        onClick={() => navigate('/factory')}
        aria-label="Create new bot"
      >
        <Plus /> <span className="hide-mobile">New Bot</span>
      </button>
    </header>
  );
}
