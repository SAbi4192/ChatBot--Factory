import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Factory, LayoutDashboard, Bot, BarChart3, LayoutTemplate,
  PanelLeftClose, PanelLeftOpen, Factory as LogoIcon,
  ChevronsUpDown, User as UserIcon, LogOut, Building2, Check,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/factory', label: 'Factory', icon: Factory },
  { to: '/library', label: 'Library', icon: Bot },
];

const NAV_UPCOMING = [
  { to: '/analytics', label: 'Analytics', icon: BarChart3, soon: true },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate, soon: true },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const navigate = useNavigate();
  const { user, orgs, currentOrg, switchOrg, logout } = useAuth();
  const [orgOpen, setOrgOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const initials = (user?.name || user?.email || '?').slice(0, 2).toUpperCase();

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

      {/* Org switcher */}
      {!collapsed && (
        <div className="side-org-wrap">
          <button className="side-org" onClick={() => setOrgOpen((o) => !o)} aria-expanded={orgOpen} aria-haspopup="listbox">
            <span className="side-org-icon"><Building2 /></span>
            <span className="side-org-meta">
              <span className="side-org-name">{currentOrg?.name ?? 'No workspace'}</span>
              <span className="side-org-role mono">{currentOrg?.role ?? '—'}</span>
            </span>
            <ChevronsUpDown className="side-org-chev" />
          </button>
          <AnimatePresence>
            {orgOpen && (
              <motion.div
                className="side-org-menu"
                role="listbox"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.14 }}
              >
                {orgs.map((org) => (
                  <button
                    key={org.id}
                    role="option"
                    aria-selected={org.id === currentOrg?.id}
                    className={`side-org-opt ${org.id === currentOrg?.id ? 'active' : ''}`}
                    onClick={() => { switchOrg(org.id); setOrgOpen(false); }}
                  >
                    <span className="side-org-opt-name">{org.name}</span>
                    {org.id === currentOrg?.id && <Check style={{ width: 14, height: 14 }} />}
                  </button>
                ))}
                <button
                  className="side-org-opt"
                  onClick={() => { setOrgOpen(false); navigate('/settings/org'); }}
                >
                  <span className="side-org-opt-name" style={{ color: 'var(--accent)' }}>+ New workspace…</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

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
        {/* User menu */}
        <div className="side-user-wrap">
          <button className="side-user" onClick={() => setUserOpen((o) => !o)} aria-expanded={userOpen} aria-haspopup="menu">
            <span className="side-user-avatar">{initials}</span>
            {!collapsed && (
              <span className="side-user-meta">
                <span className="side-user-name">{user?.name || user?.email}</span>
                <span className="side-user-role mono">{user?.role}</span>
              </span>
            )}
          </button>
          <AnimatePresence>
            {userOpen && (
              <motion.div
                className="side-user-menu"
                role="menu"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.14 }}
              >
                <button role="menuitem" onClick={() => { setUserOpen(false); navigate('/settings'); }}>
                  <UserIcon /> Account settings
                </button>
                <button role="menuitem" onClick={() => { setUserOpen(false); navigate('/settings/org'); }}>
                  <Building2 /> Organization
                </button>
                <button role="menuitem" className="danger" onClick={() => { setUserOpen(false); logout(); navigate('/login'); }}>
                  <LogOut /> Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button className="app-side-collapse" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}
