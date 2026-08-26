import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Copy, Code2, Eye } from 'lucide-react';
import { db } from '../services/db';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Switch } from '../components/ui/Switch';

export default function WidgetConfigView() {
  const { botId } = useParams<{ botId: string }>();
  const [botName, setBotName] = useState('this bot');
  const [embedCode, setEmbedCode] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem(`cbf:widget:sound:${botId}`) !== 'off');
  const [prechatOn, setPrechatOn] = useState(() => localStorage.getItem(`cbf:widget:prechat:${botId}`) === 'on');

  useEffect(() => {
    if (!botId) return;
    db.getBot(botId).then((b) => {
      if (b) setBotName(b.name);
      const script = `<script src="${window.location.origin}/widget.js" data-bot-id="${botId}"></script>`;
      setEmbedCode(script);
    });
  }, [botId]);

  const toggleSound = (on: boolean) => {
    setSoundOn(on);
    if (botId) localStorage.setItem(`cbf:widget:sound:${botId}`, on ? 'on' : 'off');
    toast.success(on ? 'Sound notifications enabled' : 'Sound notifications muted');
  };

  const togglePrechat = (on: boolean) => {
    setPrechatOn(on);
    if (botId) localStorage.setItem(`cbf:widget:prechat:${botId}`, on ? 'on' : 'off');
    toast.success(on ? 'Pre-chat form enabled' : 'Pre-chat form disabled');
  };

  const copy = async () => {
    if (!embedCode) return;
    await navigator.clipboard.writeText(embedCode);
    toast.success('Embed code copied — paste it into any page');
  };

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: '0.5rem' }}>Developer</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8rem', marginBottom: '0.3rem' }}>
        Embeddable widget
      </h1>
      <p style={{ color: 'var(--fg-dim)', fontSize: '0.88rem', marginBottom: '1.6rem' }}>
        Put <b style={{ color: 'var(--fg)' }}>{botName}</b> on any website with one script tag — no account needed by visitors.
      </p>

      <div className="dash-grid-2">
        <div>
          <Card className="settings-card">
            <h3>Embed code</h3>
            <p className="card-desc">Copy this snippet into the <code>&lt;head&gt;</code> of any HTML page.</p>
            <div className="invite-code" style={{ display: 'block', padding: '1rem 1.2rem' }}>
              <code style={{ fontSize: '0.82rem', letterSpacing: '0.02em', wordBreak: 'break-all' }}>{embedCode || 'Loading embed code…'}</code>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
              <Button variant="primary" onClick={copy} disabled={!embedCode}><Copy /> Copy</Button>
              <Button variant="ghost" onClick={() => setShowPreview(o => !o)}><Eye /> {showPreview ? 'Hide preview' : 'Show preview'}</Button>
            </div>
          </Card>

          <Card className="settings-card">
            <h3>Widget settings</h3>
            <p className="card-desc">Configuration applied to the embedded chat.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem' }}>
              <Switch checked={soundOn} onChange={toggleSound} label="Sound notifications" />
              <div><div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Sound notifications</div><div style={{ fontSize: '0.78rem', color: 'var(--fg-dim)' }}>Play a tone on new messages</div></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <Switch checked={prechatOn} onChange={togglePrechat} label="Pre-chat form" />
              <div><div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Pre-chat form</div><div style={{ fontSize: '0.78rem', color: 'var(--fg-dim)' }}>Collect name + email before chatting</div></div>
            </div>
          </Card>

          <Card className="settings-card">
            <h3>How it works</h3>
            <p className="card-desc">
              <Code2 style={{ width: 14, height: 14, display: 'inline', verticalAlign: '-2px' }} /> The launcher injects a floating bubble.
              Clicking it opens an iframe that loads <code>/widget/{botId}</code> — a self-contained chat page styled with the bot's Design DNA.
              Messages flow through the <b>public API</b> (<code>/api/public/chat</code>), so visitors don't need accounts.
              Conversations persist per visitor via localStorage.
            </p>
          </Card>
        </div>

        {/* Live preview */}
        <div>
          <div className="dash-section-title"><span>Live preview</span></div>
          {showPreview && (
            <div style={{ position: 'relative', height: 540, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border-default)', background: 'var(--bg-primary)' }}>
              <iframe
                src={`/widget/${botId}`}
                title="Widget preview"
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}