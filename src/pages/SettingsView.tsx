import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { toast } from 'sonner';
import { User as UserIcon, Building2, KeyRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { db } from '../services/db';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export default function SettingsView() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [avatar, setAvatar] = useState(user?.avatar ?? '');
  const [saving, setSaving] = useState(false);

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await db.updateProfile(name || 'Anonymous', avatar || undefined);
      await refreshUser();
      toast.success('Profile updated');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    if (newPw.length < 8) { toast.error('New password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    setPwBusy(true);
    try {
      await db.changePassword(curPw, newPw);
      toast.success('Password changed — other sessions were signed out');
      setCurPw(''); setNewPw(''); setConfirmPw('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: '0.5rem' }}>Account</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8rem', marginBottom: '1.6rem' }}>
        Settings
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
          <Card className="settings-card">
            <h3>Profile</h3>
            <p className="card-desc">How you appear across the factory — your name, email and avatar.</p>

            <label className="settings-field">
              <span>Display name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </label>

            <label className="settings-field">
              <span>Avatar emoji</span>
              <Input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="🤖 (any emoji)" maxLength={8} />
            </label>

            <label className="settings-field">
              <span>Email (read-only)</span>
              <Input value={user?.email ?? ''} disabled />
            </label>

            <Button variant="primary" onClick={saveProfile} disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </Button>
          </Card>

          <Card className="settings-card">
            <h3>Change password</h3>
            <p className="card-desc">
              Changing your password signs out every other session (refresh tokens are rotated).
            </p>

            <label className="settings-field">
              <span>Current password</span>
              <Input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" />
            </label>

            <label className="settings-field">
              <span>New password</span>
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
            </label>

            <label className="settings-field">
              <span>Confirm new password</span>
              <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
            </label>

            <Button variant="ghost" onClick={savePassword} disabled={pwBusy}>
              <KeyRound /> {pwBusy ? 'Updating…' : 'Update password'}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
