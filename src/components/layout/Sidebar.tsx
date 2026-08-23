import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Factory, LayoutDashboard, Bot, BarChart3, LayoutTemplate,
  Settings, PanelLeftClose, PanelLeftOpen, Factory as LogoIcon,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/factory', label: 'Factory', icon: Factory },
  { to: '/library', label: 'Library', icon: Bot },
];

const NAV_UPCOMING = [
  { to: '/analytics', label: 'Analytics', icon: BarChart3, soon: true },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate, soon: true },
  { to: '/settings', label: 'Settings', icon: Settings, soon: true },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const navigate = useNavigate();

  const renderLink = ({ to, label, icon: Icon, end, soon }: typeof NAV_ITEMS[number] & { soon?: boolean }) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) => `app-side-link ${isActive ? 'active' : ''}`}
      aria-label={label}
    >
      <Icon />
      {!collapsed && (
        <span className="app-side-label">
          {label}
          {soon && <span style={{ color: 'var(--fg-faint)', marginLeft: 6, fontSize: '0.62rem' }}>soon</span>}
        </span>
      )}
    </NavLink>
  );

  return (
    <motion.aside
      className={`app-sidebar ${collapsed ? 'app-sidebar--closed' : 'app-sidebar--open'}`}
      initial={false}
      animate={{ width: collapsed ? 64 : 236 }}
      transition={{ type: 'spring', stiffness: 340, damping: 34 }}
      aria-label="Primary"
    >
      <div className="app-side-logo">
        <span className="mark" onClick={() => navigate('/')} style={{ cursor: 'pointer' }} aria-hidden="true">
          <LogoIcon />
        </span>
        {!collapsed && (
          <span className="word">
            Chatbot Factory
            <small>universal engine · v4</small>
          </span>
        )}
      </div>

      <nav className="app-side-nav">
        {NAV_ITEMS.map(renderLink)}
        {!collapsed && (
          <div style={{ margin: '0.9rem 0.7rem 0.35rem', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--fg-faint)' }}>
            More
          </div>
        )}
        {NAV_UPCOMING.map(renderLink)}
      </nav>

      <div className="app-side-foot">
        <button className="app-side-collapse" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}
