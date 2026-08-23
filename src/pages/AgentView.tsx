import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Bot, CheckCircle, UserCheck, Send, Plus, Lightbulb,
} from 'lucide-react';
import { db } from '../services/db';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';

interface QueueItem {
  id: string; botId: string; botName: string; conversationId: string;
  status: string; agentName: string | null; createdAt: number;
}

export default function AgentView() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [active, setActive] = useState<{ session: QueueItem; messages: Array<{ id: string; role: string; content: string; provider?: string; createdAt: number }>; canned: Array<{ id: string; label: string; text: string }> } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [note, setNote] = useState('');

  const load = async () => {
    try {
      const q = await db.getAgentQueue();
      setQueue(q);
    } catch { setQueue([]); }
  };
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const open = async (item: QueueItem) => {
    try {
      const [sessionData, canned] = await Promise.all([
        db.getAgentSession(item.id),
        db.getCannedResponses(),
      ]);
      const session = { session: item, messages: sessionData.messages, canned: canned.responses };
      setActive(session);
      await db.pickupSession(item.id).catch(() => {});
      load();
    } catch { toast.error('Could not open session'); }
  };

  const sendReply = async () => {
    if (!active || !replyText.trim()) return;
    try {
      await db.agentReply(active.session.id, replyText.trim());
      const updated = await db.getAgentSession(active.session.id);
      setActive({ ...active, messages: updated.messages });
      setReplyText('');
    } catch (e) { toast.error((e as Error).message); }
  };

  const close = async () => {
    if (!active) return;
    try {
      await db.closeSession(active.session.id);
      toast.success('Session closed — control returns to the bot');
      setActive(null);
      load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const suggest = async () => {
    if (!active) return;
    try {
      const s = await db.suggestReply(active.session.id);
      setSuggestion(s.suggestion);
    } catch { toast.error('Could not get suggestion'); }
  };

  const addNote = async () => {
    if (!active || !note.trim()) return;
    try {
      await db.addAgentNote(active.session.id, note.trim());
      toast.success('Note added');
      setNote('');
    } catch (e) { toast.error((e as Error).message); }
  };

  const applyCanned = (text: string) => setReplyText(text);

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: '0.5rem' }}>Human-in-the-loop</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8rem', marginBottom: '1.6rem' }}>
        Agent dashboard
      </h1>

      <div className="dash-grid-2">
        {/* Queue */}
        <Card>
          <div className="dash-section-title"><span>Queue ({queue.length})</span></div>
          {queue.length === 0 ? (
            <EmptyState icon={<CheckCircle />} title="All clear" description="No conversations waiting for a human agent." />
          ) : (
            <div>
              {queue.map((s) => (
                <button key={s.id} className="dash-conv-item" onClick={() => open(s)}>
                  <Bot style={{ width: 16, height: 16, color: 'var(--accent)' }} />
                  <span className="meta"><span className="title">{s.botName}</span><span className="sub">{s.agentName ? `Handled by ${s.agentName}` : `Queued ${Math.floor((Date.now() - s.createdAt) / 60000)}m ago`}</span></span>
                  <Badge tone={s.status === 'active' ? 'accent' : 'default'}>{s.status}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Active session */}
        <Card style={{ display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
          {active ? (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
                <Badge tone="accent">{active.session.botName}</Badge>
                <Button variant="ghost" size="sm" onClick={suggest}><Lightbulb /> Suggest</Button>
                <Button variant="danger" size="sm" onClick={close}><CheckCircle /> Close</Button>
              </div>
              {suggestion && (
                <div style={{ padding: '0.6rem 0.8rem', background: 'var(--accent-subtle)', border: '1px solid var(--signal-line)', borderRadius: 8, marginBottom: '0.8rem', fontSize: '0.84rem' }}>
                  <span className="mono" style={{ color: 'var(--accent)', fontSize: '0.66rem' }}>CO-PILOT SUGGESTION</span>
                  <p style={{ marginTop: 4 }}>{suggestion}</p>
                </div>
              )}
              <div style={{ flex: 1, overflowY: 'auto', marginBottom: '0.8rem' }}>
                {active.messages.map((m) => (
                  <div key={m.id} style={{ marginBottom: '0.6rem', padding: '0.5rem 0.7rem', background: m.role === 'user' ? 'var(--bg-tertiary)' : 'transparent', borderRadius: 8, fontSize: '0.85rem', lineHeight: 1.55 }}>
                    <span className="mono" style={{ fontSize: '0.62rem', color: 'var(--fg-faint)', textTransform: 'uppercase' }}>{m.role}{m.provider === 'agent' ? ' (agent reply)' : ''}</span>
                    <p style={{ marginTop: 2 }}>{m.content}</p>
                  </div>
                ))}
              </div>
              {/* Canned responses */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.5rem' }}>
                {active.canned.map((c) => (
                  <button key={c.id} className="bot-provenance" style={{ cursor: 'pointer' }} onClick={() => applyCanned(c.text)} title={c.text}>
                    {c.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input className="ui-input" value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Type a reply…" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }} />
                <Button variant="primary" size="sm" onClick={sendReply} disabled={!replyText.trim()}><Send /> Reply</Button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input className="ui-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (not visible to user)" />
                <Button variant="ghost" size="sm" onClick={addNote} disabled={!note.trim()}><Plus /> Note</Button>
              </div>
            </>
          ) : (
            <EmptyState icon={<UserCheck />} title="Pick a session" description="Select a conversation from the queue to start assisting." />
          )}
        </Card>
      </div>
    </div>
  );
}