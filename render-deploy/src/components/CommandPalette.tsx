import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { Search, Factory, LayoutDashboard, BarChart3, LayoutTemplate, Settings, CornerDownLeft } from 'lucide-react';
import type { Bot } from '../types';
import { db } from '../services/db';

const QUICK_ACTIONS = [
  { id: 'dashboard', label: 'Go to Dashboard', icon: LayoutDashboard, run: () => ({ to: '/' }) },
  { id: 'factory', label: 'Open the Factory', icon: Factory, run: () => ({ to: '/factory' }) },
  { id: 'analytics', label: 'View Analytics (soon)', icon: BarChart3, run: () => ({ to: '/' }) },
  { id: 'templates', label: 'Browse Templates (soon)', icon: LayoutTemplate, run: () => ({ to: '/' }) },
  { id: 'settings', label: 'Settings (soon)', icon: Settings, run: () => ({ to: '/' }) },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [bots, setBots] = useState<Bot[]>([]);

  useEffect(() => {
    if (!open) return;
    db.getBots().then((b) => setBots(b.slice(0, 40))).catch(() => setBots([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk-dialog" role="dialog" aria-modal="true" aria-label="Search">
        <Command
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        >
          <div className="cmdk-input-row">
            <Search />
            <Command.Input
              className="cmdk-input"
              placeholder="Search bots, or run an action…"
              autoFocus
            />
            <span className="kbd-hint">Esc</span>
          </div>
          <Command.List className="cmdk-list">
            <Command.Empty className="cmdk-empty">No results found.</Command.Empty>

            <Command.Group heading={<span className="cmdk-group-label">Quick actions</span>}>
              {QUICK_ACTIONS.map((a) => (
                <Command.Item
                  key={a.id}
                  className="cmdk-item"
                  onSelect={() => { const r = a.run(); navigate(r.to); onClose(); }}
                >
                  <a.icon />
                  <span>{a.label}</span>
                  <CornerDownLeft className="cmdk-sub" />
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading={<span className="cmdk-group-label">Bots</span>}>
              {bots.map((b) => (
                <Command.Item
                  key={b.id}
                  className="cmdk-item"
                  onSelect={() => { navigate(`/chat/${b.id}`); onClose(); }}
                >
                  <span
                    className="cmdk-avatar"
                    style={{ background: b.designDna?.primaryColor || 'var(--bg-tertiary)', color: '#fff' }}
                  >
                    {b.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                  <span className="cmdk-sub">{b.domain}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
