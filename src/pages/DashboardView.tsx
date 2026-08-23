import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, Bot as BotIcon, Factory, MessageSquare, Sparkles, BarChart3,
  LayoutTemplate, Cpu, Globe, ShieldCheck, Lightbulb, ChevronRight, Building2,
} from 'lucide-react';
import type { Bot, Conversation } from '../types';
import { db, type ProviderStatus, type OrgSummary } from '../services/db';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { SkeletonCard } from '../components/ui/Skeleton';
import { StatCard } from '../components/ui/StatCard';
import { EmptyState } from '../components/ui/EmptyState';

const TIPS = [
  <>Use <b>Ctrl+K</b> anywhere to search your bots instantly.</>,
  <>Bots politely refuse off-topic questions — try asking a banking bot about cooking.</>,
  <>Questions about <b>current events</b> are routed to web-enhanced AI automatically.</>,
  <>The Factory can forge <b>5,000 bots</b> in one production run.</>,
  <>Each bot ships with its own visual identity — a theme, layout, and message style.</>,
  <>Press <b>?</b> to see every keyboard shortcut.</>,
];

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function DashboardView() {
  const navigate = useNavigate();
  const { currentOrg } = useAuth();
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<ProviderStatus | null>(null);
  const [orgInfo, setOrgInfo] = useState<OrgSummary | null>(null);
  const [recentConvs, setRecentConvs] = useState<Array<{ conv: Conversation; bot: Bot }>>([]);

  useEffect(() => {
    let alive = true;
    db.getBots()
      .then(async (all) => {
        if (!alive) return;
        setBots(all);
        const recent = all.slice(0, 6);
        const pairs = await Promise.all(
          recent.map(async (b) => {
            const convs = await db.getConversationsByBot(b.id).catch(() => [] as Conversation[]);
            return convs.map((c) => ({ conv: c, bot: b }));
          })
        );
        if (!alive) return;
        setRecentConvs(
          pairs.flat()
            .sort((a, b) => (b.conv.updatedAt ?? 0) - (a.conv.updatedAt ?? 0))
            .slice(0, 6)
        );
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    db.getHealth().then(setHealth).catch(() => setHealth(null));
    if (currentOrg?.id) {
      db.getOrg(currentOrg.id).then(setOrgInfo).catch(() => setOrgInfo(null));
    }
    return () => { alive = false; };
  }, [currentOrg?.id]);

  const stats = useMemo(() => ({
    total: bots.length,
    conversations: bots.reduce((acc, b) => acc + (b.conversationCount ?? 0), 0),
    domains: new Set(bots.map((b) => b.domain)).size,
  }), [bots]);

  const tip = useMemo(() => TIPS[new Date().getDate() % TIPS.length], []);
  const favorites = useMemo(() => bots.filter((b) => b.favorite).slice(0, 5), [bots]);
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return 'Working late';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: 280, height: 34, marginBottom: 10 }} />
        <div className="skeleton" style={{ width: 460, height: 16, marginBottom: 26 }} />
        <div className="dash-stats-grid">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 96, borderRadius: 10 }} />)}
        </div>
        <div className="dash-grid-2">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}
          </div>
          <div className="skeleton" style={{ height: 260, borderRadius: 10 }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Welcome banner */}
      <motion.section
        className="dash-hero glass-card"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h1>{greeting} — welcome to the factory floor.</h1>
        <p>
          {stats.total > 0
            ? `You have ${stats.total.toLocaleString()} assistants on the line, spanning ${stats.domains} domains. Forge more, or jump straight into a conversation.`
            : 'Your factory floor is empty. Run your first production batch to manufacture specialized AI assistants.'}
        </p>
        <div className="dash-actions">
          <Button variant="primary" onClick={() => navigate('/factory')}>
            <Factory /> Forge bots
          </Button>
          <Button variant="ghost" onClick={() => navigate('/library')}>
            <BotIcon /> Open library
          </Button>
          <Button variant="ghost" onClick={() => navigate(stats.total ? `/chat/${bots[0].id}` : '/factory')}>
            <MessageSquare /> Start chatting
          </Button>
        </div>
      </motion.section>

      {/* Stats */}
      <div className="dash-stats-grid">
        <StatCard value={stats.total} label="Total bots" delay={0.05} />
        <StatCard value={stats.conversations} label="Conversations" delay={0.12} />
        <StatCard value={stats.domains} label="Domains" delay={0.19} />
        <StatCard
          value={health?.local ? 3 : 0}
          label="Providers online"
          delay={0.26}
          format={(n) => `${n}/3`}
        />
      </div>

      {/* Workspace quota strip */}
      {orgInfo && currentOrg && (
        <Card style={{ marginBottom: '1.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.9rem' }}>
            <Building2 style={{ width: 16, height: 16, color: 'var(--accent)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{currentOrg.name}</span>
            <Badge tone="accent">{currentOrg.role}</Badge>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--fg-faint)' }}>
              plan · {orgInfo.plan}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            {[
              { label: 'Bots', used: orgInfo.usage.bots, max: orgInfo.limits.maxBots },
              { label: 'Messages today', used: orgInfo.usage.messagesToday, max: orgInfo.limits.maxMessagesPerDay },
              { label: 'Members', used: orgInfo.usage.members, max: orgInfo.limits.maxMembers },
            ].map((q) => {
              const pct = q.max > 0 ? Math.round((q.used / q.max) * 100) : 0;
              const cls = pct >= 100 ? 'full' : pct >= 80 ? 'warn' : 'ok';
              return (
                <div key={q.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--fg-dim)' }}>{q.label}</span>
                    <span className="mono" style={{ color: 'var(--fg-faint)' }}>{q.used.toLocaleString()}/{q.max.toLocaleString()}</span>
                  </div>
                  <div className="qm-bar">
                    <div className={`qm-fill ${cls}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="dash-grid-2">
        {/* Recent bots */}
        <section>
          <div className="dash-section-title">
            <span>Recent bots</span>
            <button className="link-more" onClick={() => navigate('/library')}>
              View all <ArrowRight />
            </button>
          </div>
          {bots.length === 0 ? (
            <Card>
              <EmptyState
                icon={<BotIcon style={{ color: 'var(--fg-faint)' }} />}
                title="No bots on the line yet"
                description="Run the factory to manufacture your first batch of domain-specialized assistants."
                action={<Button variant="primary" onClick={() => navigate('/factory')}><Factory /> Open the foundry</Button>}
              />
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.9rem' }}>
              {bots.slice(0, 6).map((b, i) => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 * i, duration: 0.3 }}
                >
                  <button className="dash-bot-mini ui-card ui-card--hover" onClick={() => navigate(`/chat/${b.id}`)}>
                    <Avatar
                      name={b.name}
                      bg={b.designDna?.primaryColor}
                      color="#fff"
                      size="md"
                    />
                    <span className="meta">
                      <span className="name">{b.name}</span>
                      <span className="sub">{b.domain} · {b.subdomain}</span>
                    </span>
                    <span className="chats"><MessageSquare /> {b.conversationCount ?? 0}</span>
                  </button>
                </motion.div>
              ))}
            </div>
          )}

          {favorites.length > 0 && (
            <div style={{ marginTop: '1.4rem' }}>
              <div className="dash-section-title"><span>Favorites</span></div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {favorites.map((b) => (
                  <Badge key={b.id} tone="accent">
                    <button
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={() => navigate(`/chat/${b.id}`)}
                      title={b.name}
                    >
                      {b.name}
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Right rail: recent conversations + provider status + tip */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div>
            <div className="dash-section-title"><span>Recent conversations</span></div>
            <Card>
              {recentConvs.length === 0 ? (
                <p style={{ color: 'var(--fg-faint)', fontSize: '0.85rem', padding: '0.6rem 0' }}>
                  No conversations yet — start chatting with any bot.
                </p>
              ) : (
                <div>
                  {recentConvs.map(({ conv, bot }) => (
                    <button
                      key={conv.id}
                      className="dash-conv-item"
                      onClick={() => navigate(`/chat/${bot.id}`)}
                    >
                      <MessageSquare />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span className="title">{conv.title || 'Untitled'}</span>
                        <span className="sub">{bot.name} · {timeAgo(conv.updatedAt ?? conv.createdAt ?? Date.now())}</span>
                      </span>
                      <ChevronRight style={{ width: 14, height: 14, color: 'var(--fg-faint)' }} />
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div>
            <div className="dash-section-title"><span>AI providers</span></div>
            <div className="dash-provider-strip">
              <span className="lbl">Status</span>
              <span className={`dash-provider ${health?.local ? 'online' : 'offline'}`}>
                <span className={`dot ${health?.local ? 'on' : 'off'}`} /> <Cpu /> Local GGUF
              </span>
              <span className={`dash-provider ${health?.groq ? 'online' : 'offline'}`}>
                <span className={`dot ${health?.groq ? 'on' : 'off'}`} /> <Globe /> Groq
              </span>
              <span className={`dash-provider ${health?.gemini ? 'online' : 'offline'}`}>
                <span className={`dot ${health?.gemini ? 'on' : 'off'}`} /> <Globe /> Gemini
              </span>
              <span className="dash-provider online">
                <span className="dot on" /> <ShieldCheck /> Domain Guard
              </span>
            </div>
          </div>

          <div>
            <div className="dash-section-title"><span>Tip of the day</span></div>
            <Card>
              <div className="dash-tip">
                <Lightbulb />
                <p>{tip}</p>
              </div>
            </Card>
          </div>
        </section>
      </div>

      {/* Coming soon strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.9rem' }}>
        {[
          { label: 'Analytics dashboard', icon: BarChart3, to: '/library' },
          { label: 'Bot templates', icon: LayoutTemplate, to: '/library' },
          { label: 'Custom bot creator', icon: Sparkles, to: '/factory' },
        ].map(({ label, icon: Icon, to }) => (
          <button key={label} className="dash-bot-mini ui-card" onClick={() => navigate(to)}>
            <Icon style={{ width: 19, height: 19, color: 'var(--accent)' }} />
            <span className="meta">
              <span className="name" style={{ color: 'var(--fg-dim)' }}>{label}</span>
              <span className="sub">Coming in a later checkpoint</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
