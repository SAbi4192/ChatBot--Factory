import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { toast } from 'sonner';
import { User as UserIcon, Building2, Copy, Trash2, Plus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { db, type OrgSummary } from '../services/db';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

interface Member { userId: string; email: string; name: string | null; role: string }
interface Activity { id: string; eventType: string; data: { actorName?: string } | null; createdAt: number }

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function OrgSettingsView() {
  const { currentOrg, orgs, user, switchOrg, refreshUser } = useAuth();
  const orgId = currentOrg?.id;
  const isAdmin = currentOrg?.role === 'admin';

  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [name, setName] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    const [o, m, a] = await Promise.all([
      db.getOrg(orgId),
      db.getOrgMembers(orgId),
      db.getOrgActivity(orgId),
    ]);
    setOrg(o);
    setName(o.name);
    setMembers(m);
    setActivity(a as Activity[]);
  }, [orgId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const quotas = useMemo(() => {
    if (!org) return null;
    return [
      { label: 'Bots', used: org.usage.bots, max: org.limits.maxBots },
      { label: 'Messages today', used: org.usage.messagesToday, max: org.limits.maxMessagesPerDay },
      { label: 'Members', used: org.usage.members, max: org.limits.maxMembers },
    ];
  }, [org]);

  const makeInvite = async () => {
    if (!orgId) return;
    try {
      const inv = await db.createInvite(orgId, inviteRole);
      setInviteCode(inv.code);
      toast.success(`Invite created — ${inv.role} role`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const copyInvite = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    toast.success('Invite code copied — share it with a teammate');
  };

  const changeRole = async (userId: string, role: string) => {
    if (!orgId) return;
    await db.setMemberRole(orgId, userId, role);
    toast.success('Role updated');
    load();
  };

  const removeMember = async (userId: string) => {
    if (!orgId) return;
    await db.removeMember(orgId, userId);
    toast.success('Member removed');
    load();
  };

  const createWorkspace = async () => {
    if (newOrgName.trim().length < 2) { toast.error('Give the workspace a name'); return; }
    try {
      const created = await db.createOrg(newOrgName.trim());
      toast.success(`Workspace "${created.name}" created`);
      setCreateOpen(false);
      setNewOrgName('');
      await refreshUser();
      // The org list refreshes on the next render via useAuth; switch to it.
      switchOrg(created.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const deleteThisOrg = async () => {
    if (!orgId) return;
    try {
      await db.deleteOrg(orgId);
      toast.success('Workspace deleted');
      setConfirmDelete(false);
      await refreshUser();
      const remaining = orgs.filter((o) => o.id !== orgId);
      if (remaining.length > 0) switchOrg(remaining[0].id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!orgId) {
    return (
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8rem', marginBottom: '1rem' }}>Organization</h1>
        <Card className="settings-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--fg-dim)', marginBottom: '1rem' }}>You are not a member of any workspace yet.</p>
          <Button variant="primary" onClick={() => setCreateOpen(true)}><Plus /> Create workspace</Button>
        </Card>
        <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create workspace">
          <label className="settings-field">
            <span>Workspace name</span>
            <Input value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="My team's bots" />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1rem' }}>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={createWorkspace}>Create</Button>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: '0.5rem' }}>Workspace</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8rem', marginBottom: '1.6rem' }}>
        {org?.name ?? 'Organization'}
      </h1>

      <div className="settings-grid">
        <nav className="settings-nav" aria-label="Settings sections">
          <NavLink to="/settings" end className={({ isActive }) => (isActive ? 'active' : '')}>
            <UserIcon /> Profile
          </NavLink>
          <NavLink to="/settings/org" className={({ isActive }) => (isActive ? 'active' : '')}>
            <Building2 /> Organization
          </NavLink>
        </nav>

        <div>
          {/* Usage quotas */}
          <Card className="settings-card">
            <h3>Usage</h3>
            <p className="card-desc">Consumption against this workspace's plan. Soft warning at 80%, hard block at 100%.</p>
            {quotas?.map((q) => {
              const pct = q.max > 0 ? Math.round((q.used / q.max) * 100) : 0;
              const cls = pct >= 100 ? 'full' : pct >= 80 ? 'warn' : 'ok';
              return (
                <div className="quota-meter" key={q.label}>
                  <div className="qm-head">
                    <span className="qm-label">{q.label}</span>
                    <span className="qm-value">{q.used.toLocaleString()} / {q.max.toLocaleString()} ({pct}%)</span>
                  </div>
                  <div className="qm-bar">
                    <div className={`qm-fill ${cls}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })}
            <Badge tone="accent">Plan: {org?.plan ?? 'free'}</Badge>
          </Card>

          {/* Settings (admin) */}
          {isAdmin && (
            <Card className="settings-card">
              <h3>Workspace settings</h3>
              <p className="card-desc">Rename the workspace. Invites below.</p>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label className="settings-field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                  <span>Name</span>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <Button variant="primary" onClick={async () => {
                  if (!orgId) return;
                  try {
                    await db.updateOrg(orgId, name);
                    toast.success('Workspace renamed');
                    await refreshUser();
                    load();
                  } catch (e) { toast.error((e as Error).message); }
                }}>Save</Button>
              </div>
            </Card>
          )}

          {/* Members */}
          <Card className="settings-card">
            <h3>Members</h3>
            <p className="card-desc">People with access to this workspace and their roles.</p>
            <div>
              {members.map((m) => (
                <div className="member-row" key={m.userId}>
                  <span className="side-user-avatar" style={{ width: 30, height: 30, fontSize: '0.7rem' }}>
                    {(m.name || m.email).slice(0, 2).toUpperCase()}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="m-name">{m.name || '—'}</span>
                    <span className="m-email"> {m.email}</span>
                  </span>
                  {isAdmin && m.userId !== user?.id ? (
                    <select
                      className="ui-input"
                      style={{ width: 'auto', padding: '0.3rem 0.5rem', fontSize: '0.78rem' }}
                      value={m.role}
                      onChange={(e) => changeRole(m.userId, e.target.value)}
                      aria-label={`Role of ${m.email}`}
                    >
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    <Badge tone={m.role === 'admin' ? 'accent' : 'default'}>{m.role}</Badge>
                  )}
                  {isAdmin && m.userId !== user?.id && (
                    <Button variant="ghost" size="sm" onClick={() => removeMember(m.userId)}>Remove</Button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Invites (admin) */}
          {isAdmin && (
            <Card className="settings-card">
              <h3>Invite teammates</h3>
              <p className="card-desc">
                Generate an invite code — no email server needed. The code expires in 7 days and can be used once.
              </p>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <select
                  className="ui-input"
                  style={{ width: 'auto' }}
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  aria-label="Invite role"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
                <Button variant="primary" onClick={makeInvite}><Plus /> Generate invite</Button>
              </div>
              {inviteCode && (
                <div className="invite-code">
                  <code>{inviteCode}</code>
                  <Button variant="ghost" size="sm" onClick={copyInvite}><Copy /> Copy</Button>
                </div>
              )}
            </Card>
          )}

          {/* Activity */}
          <Card className="settings-card">
            <h3>Activity log</h3>
            <p className="card-desc">Audit trail — who did what, when.</p>
            <div className="activity-list">
              {activity.length === 0 && <p style={{ color: 'var(--fg-faint)', fontSize: '0.85rem' }}>No activity yet.</p>}
              {activity.map((a) => (
                <div className="activity-item" key={a.id}>
                  <span className="a-type">{a.eventType}</span>
                  <span className="a-who">{a.data?.actorName ?? '—'}</span>
                  <span className="a-when">{timeAgo(a.createdAt)}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Danger zone (admin) */}
          {isAdmin && (
            <Card className="settings-card" style={{ borderColor: 'rgba(248, 113, 113, 0.3)' }}>
              <h3 style={{ color: 'var(--error)' }}>Danger zone</h3>
              <p className="card-desc">Delete this workspace and everything in it — bots, conversations, activity. This cannot be undone.</p>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Delete workspace
              </Button>
            </Card>
          )}
        </div>
      </div>

      {/* Create workspace modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create workspace">
        <label className="settings-field">
          <span>Workspace name</span>
          <Input value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="My team's bots" />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1rem' }}>
          <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={createWorkspace}>Create</Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this workspace?"
        message={`"${org?.name}" and every bot, conversation, and message inside it will be permanently deleted.`}
        confirmLabel="Delete workspace"
        onConfirm={deleteThisOrg}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
