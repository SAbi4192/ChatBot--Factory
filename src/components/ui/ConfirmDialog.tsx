import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  /** Optional checklist rendered under the message (e.g. "GitHub repo · Render service"). */
  items?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Destructive-action confirmation. Replaces window.confirm everywhere. */
export function ConfirmDialog({
  open,
  title,
  message,
  items,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title={title}
      maxWidth={420}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</Button>
        </>
      }
    >
      <div className="ui-confirm-icon"><AlertTriangle /></div>
      <div style={{ color: 'var(--fg-dim)', fontSize: '0.9rem', lineHeight: 1.65 }}>{message}</div>
      {items && items.length > 0 && (
        <ul className="ui-confirm-items">
          {items.map((it) => <li key={it}>{it}</li>)}
        </ul>
      )}
    </Modal>
  );
}
