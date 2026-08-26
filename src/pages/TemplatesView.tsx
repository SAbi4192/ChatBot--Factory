import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { LayoutTemplate, Loader2, Rocket } from 'lucide-react';
import { db } from '../services/db';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import './LibraryView.css';

interface Template {
  id: string;
  category: string;
  name: string;
  emoji: string;
  description: string;
  theme: string;
  domain: string;
  subdomain: string;
  prompt: string;
}

export default function TemplatesView() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [cat, setCat] = useState('All');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    db.getTemplates()
      .then((r) => setTemplates(r.templates))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const cats = useMemo(() => ['All', ...new Set(templates.map((t) => t.category))], [templates]);
  const shown = cat === 'All' ? templates : templates.filter((t) => t.category === cat);

  const install = async (t: Template) => {
    setInstalling(t.id);
    try {
      const bot = await db.installTemplate(t.id);
      toast.success(`"${t.name}" installed — opening it now`);
      navigate(`/chat/${bot.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: '0.5rem' }}>Marketplace</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8rem', marginBottom: '0.3rem' }}>
        Bot templates
      </h1>
      <p style={{ color: 'var(--fg-dim)', fontSize: '0.88rem', marginBottom: '1.4rem' }}>
        One-click production-ready bots — then customize them in the builder.
      </p>

      <div className="lib-filters" style={{ marginBottom: '1.4rem', flexWrap: 'wrap' }}>
        {cats.map((c) => (
          <button key={c} className={`lib-filter ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 170, borderRadius: 12 }} />)}
        </div>
      ) : error ? (
        <EmptyState icon={<LayoutTemplate />} title="Marketplace unavailable" description={error} />
      ) : shown.length === 0 ? (
        <EmptyState icon={<LayoutTemplate />} title="No templates" description="The marketplace is empty." />
      ) : (
        <div className="bot-grid">
          {shown.map((t) => (
            <article key={t.id} className="bot-card" style={{ animation: 'none' }}>
              <div className="bot-card-top">
                <span className="bot-mono" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: '1.4rem' }}>{t.emoji}</span>
              </div>
              <h3 className="bot-name">{t.name}</h3>
              <div className="bot-domain mono">{t.domain} · {t.subdomain}</div>
              <p className="bot-desc">{t.description}</p>
              <div className="bot-card-foot" style={{ borderTop: 'none', paddingTop: 0 }}>
                <span className="bot-dna"><span className="mono" style={{ color: 'var(--fg-faint)' }}>{t.theme} theme</span></span>
                <Button variant="primary" size="sm" onClick={() => install(t)} disabled={installing === t.id}>
                  {installing === t.id ? <Loader2 className="spin" /> : <Rocket />} Install
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}