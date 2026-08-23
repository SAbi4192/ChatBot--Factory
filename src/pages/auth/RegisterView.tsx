import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Factory, Mail, Lock, User as UserIcon, UserPlus, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

function strength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const labels = ['Too weak', 'Weak', 'Okay', 'Good', 'Strong'];
  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score] };
}

export default function RegisterView() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pw = useMemo(() => strength(password), [password]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (pw.score < 2) { setError('Please choose a stronger password'); return; }
    setBusy(true);
    try {
      await register(email, name || email.split('@')[0], password);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-grid" aria-hidden="true" />
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 22, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <div className="auth-brand">
          <span className="auth-mark"><Factory /></span>
          <div>
            <div className="auth-word">Chatbot Factory</div>
            <div className="auth-sub">universal engine · create account</div>
          </div>
        </div>

        <h1 className="auth-title">Start your own factory.</h1>
        <p className="auth-lede">Each account gets a private workspace with its own bots and analytics.</p>

        <form onSubmit={submit} noValidate>
          <label className="auth-field">
            <span>Display name</span>
            <div className="auth-input-wrap">
              <UserIcon />
              <Input
                type="text"
                placeholder="Ada Lovelace"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          </label>

          <label className="auth-field">
            <span>Email</span>
            <div className="auth-input-wrap">
              <Mail />
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
          </label>

          <label className="auth-field">
            <span>Password</span>
            <div className="auth-input-wrap">
              <Lock />
              <Input
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            {password && (
              <div className="pw-meter" aria-label={`Password strength: ${pw.label}`}>
                <div className="pw-segments" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <i key={i} className={i < pw.score ? `on lvl-${pw.score}` : ''} />
                  ))}
                </div>
                <span className={`pw-label mono lvl-${pw.score}`}>{pw.label}</span>
              </div>
            )}
          </label>

          <label className="auth-field">
            <span>Confirm password</span>
            <div className="auth-input-wrap">
              <Lock />
              <Input
                type="password"
                placeholder="Repeat your password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </label>

          {error && (
            <motion.div
              className="auth-error"
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <AlertCircle /> {error}
            </motion.div>
          )}

          <Button type="submit" variant="primary" size="lg" className="auth-submit" disabled={busy}>
            {busy ? <Loader2 className="spin" /> : <UserPlus />}
            {busy ? 'Creating…' : 'Create account'}
          </Button>
        </form>

        <p className="auth-alt">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}
