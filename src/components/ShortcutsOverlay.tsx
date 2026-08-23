import { Keyboard } from 'lucide-react';
import { Modal } from './ui/Modal';

const SHORTCUTS: Array<[string[], string]> = [
  [['Ctrl', 'K'], 'Spotlight search'],
  [['Ctrl', 'N'], 'Create a new bot'],
  [['Ctrl', 'B'], 'Toggle sidebar'],
  [['Ctrl', 'Enter'], 'Send message (chat)'],
  [['Shift', 'Enter'], 'New line (chat)'],
  [['Esc'], 'Close dialog / search'],
  [['?'], 'Show this overlay'],
];

export function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" maxWidth={460}>
      <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', marginBottom: '1.2rem', color: 'var(--fg-dim)', fontSize: '0.85rem' }}>
        <Keyboard style={{ width: 18, height: 18 }} />
        <span>Everything is reachable from the keyboard.</span>
      </div>
      <div className="shortcuts-grid">
        {SHORTCUTS.map(([keys, label]) => (
          <div className="shortcut-row" key={label}>
            <span style={{ color: 'var(--fg-dim)' }}>{label}</span>
            <span className="keys">
              {keys.map((k) => <span className="kbd-hint" key={k}>{k}</span>)}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
