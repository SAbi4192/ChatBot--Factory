import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Factory, Mail, Lock, LogIn, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export default function LoginView() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password, remember);
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
            <div className="auth-sub">universal engine · sign in</div>
          </div>
        </div>

        <h1 className="auth-title">Welcome back.</h1>
        <p className="auth-lede">Sign in to run the foundry and talk to your assistants.</p>

        <form onSubmit={submit} noValidate>
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
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          </label>

          <label className="auth-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Remember me</span>
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
            {busy ? <Loader2 className="spin" /> : <LogIn />}
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="auth-alt">
          New to the factory? <Link to="/register">Create an account</Link>
        </p>

        <div className="auth-demo">
          <span className="auth-demo-lbl mono">DEMO ADMIN</span>
          <code>admin@factory.local · admin123</code>
        </div>
      </motion.div>
    </div>
  );
}
