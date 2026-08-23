import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Factory, Bot } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from '../CommandPalette';
import { ShortcutsOverlay } from '../ShortcutsOverlay';

const MOBILE_TABS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/factory', label: 'Factory', icon: Factory },
  { to: '/library', label: 'Library', icon: Bot },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const toggleSidebar = useCallback(() => setCollapsed((c) => !c), []);

  // Global keyboard shortcuts: Ctrl/Cmd+K search, Ctrl+N new bot, Ctrl+B sidebar, ? shortcuts.
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen((o) => !o); }
    else if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleSidebar(); }
    else if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); navigate('/factory'); }
    else if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag !== 'input' && tag !== 'textarea') { e.preventDefault(); setShortcutsOpen((o) => !o); }
    }
  }, [navigate, toggleSidebar]);

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />

      <div className="app-main">
        <TopBar onOpenSearch={() => setSearchOpen(true)} />
        <motion.main
          id="main-content"
          className="app-content"
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
        >
          {children}
        </motion.main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="app-mobile-tabs" aria-label="Primary (mobile)">
        {MOBILE_TABS.map(({ to, label, icon: Icon }) => (
          <button
            key={to}
            className={`app-mobile-tab ${location.pathname === to ? 'active' : ''}`}
            onClick={() => navigate(to)}
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
