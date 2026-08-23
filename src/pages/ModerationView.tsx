import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldAlert, Check, Ban, RefreshCw, Loader2 } from 'lucide-react';
import { db } from '../services/db';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';

interface FlaggedMsg {
  id: string;
  content: string;
  nlu: { toxicity?: { toxic: boolean }; injection?: { injected: boolean }; pii?: unknown[]; blocked?: string; approved?: boolean };
  createdAt: number;
  conversationId: string;
  conversationTitle: string | null;
  botName: string;
  botId: string;
}

export default function ModerationView() {
  const [items, setItems] = useState<FlaggedMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    db.getFlagged().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const approve = async (id: string) => {
    setBusy(id);
    try {
      await db.approveFlagged(id);
      toast.success('Message approved');
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  const block = async (id: string) => {
    setBusy(id);
    try {
      await db.blockFlagged(id);
      toast.success('Message blocked and removed');
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: '0.5rem' }}>Guardrails</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8rem', marginBottom: '0.3rem' }}>
        Content moderation
      </h1>
      <p style={{ color: 'var(--fg-dim)', fontSize: '0.88rem', marginBottom: '1.6rem' }}>
        Messages flagged by the NLU guardrails — toxicity, prompt injection, or PII.
      </p>

      <Card>
        <div className="dash-section-title">
          <span>Flagged messages ({items.length})</span>
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw /> Refresh</Button>
        </div>
        {loading ? (
          <div style={{ display: 'grid', gap: '0.5rem', padding: '1rem 0' }}>
            {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 48, borderRadius: 8 }} />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert style={{ color: 'var(--success)' }} />}
            title="No flagged messages"
            description="The guardrails are holding the line — nothing to review right now."
          />
        ) : (
          <div>
            {items.map((m) => (
              <div className="member-row" key={m.id} style={{ alignItems: 'flex-start' }}>
                <ShieldAlert style={{ width: 16, height: 16, color: 'var(--error)', marginTop: 3 }} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="m-name" style={{ fontWeight: 500, display: 'block' }}>{m.content.slice(0, 160)}{m.content.length > 160 ? '…' : ''}</span>
                  <span className="m-email">{m.botName} · {m.conversationTitle || 'Untitled'}</span>
                </span>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                  {m.nlu.toxicity?.toxic && <Badge tone="error">toxic</Badge>}
                  {m.nlu.injection?.injected && <Badge tone="error">injection</Badge>}
                  {(m.nlu.pii?.length ?? 0) > 0 && <Badge tone="warning">pii</Badge>}
                </div>
                {m.nlu.approved ? (
                  <Badge tone="success">approved</Badge>
                ) : (
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <Button variant="ghost" size="sm" onClick={() => approve(m.id)} disabled={busy === m.id}>
                      {busy === m.id ? <Loader2 className="spin" /> : <Check />} Approve
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => block(m.id)} disabled={busy === m.id}>
                      {busy === m.id ? <Loader2 className="spin" /> : <Ban />} Block
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}