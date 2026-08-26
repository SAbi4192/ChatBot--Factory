import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Search, Plus, Sun, Moon, Sparkles, Dices, LayoutTemplate } from 'lucide-react';
import { getTheme, toggleTheme, type Theme } from '../../utils/theme';

const CRUMBS: Record<string, string> = {
  '/': 'Dashboard',
  '/factory': 'Create Bot',
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
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const seg = location.pathname.split('/').filter(Boolean);
  const root = `/${seg[0] ?? ''}`;
  const rootLabel = CRUMBS[root] || 'Dashboard';

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleThemeToggle = () => {
    // Add transition class for smooth switching
    document.documentElement.classList.add('theme-transition');
    const newTheme = toggleTheme();
    setTheme(newTheme);
    setTimeout(() => document.documentElement.classList.remove('theme-transition'), 400);
  };

  const menuItems = [
    { label: 'Custom Chatbot', desc: 'AI designs everything', icon: Sparkles, to: '/factory/custom' },
    { label: 'Random Chatbots', desc: 'Generate at scale', icon: Dices, to: '/factory/random' },
    { label: 'From Template', desc: 'Start from a preset', icon: LayoutTemplate, to: '/templates' },
  ];

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

      {/* Theme toggle */}
      <button
        className="app-theme-toggle"
        onClick={handleThemeToggle}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? <Sun /> : <Moon />}
      </button>

      {/* +New Bot dropdown */}
      <div className="app-newbot-wrap" ref={menuRef}>
        <button
          className="ui-btn ui-btn--primary ui-btn--sm"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Create new bot"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <Plus /> <span className="hide-mobile">New Bot</span>
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              className="app-newbot-menu"
              role="menu"
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.15, ease: [0.22, 0.61, 0.36, 1] }}
            >
              {menuItems.map(({ label, desc, icon: Icon, to }) => (
                <button
                  key={to}
                  role="menuitem"
                  className="app-newbot-item"
                  onClick={() => { setMenuOpen(false); navigate(to); }}
                >
                  <span className="app-newbot-item-icon"><Icon /></span>
                  <span className="app-newbot-item-meta">
                    <span className="app-newbot-item-label">{label}</span>
                    <span className="app-newbot-item-desc">{desc}</span>
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
