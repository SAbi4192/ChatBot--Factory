import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Bot as BotIcon, ThumbsUp, Download, Activity } from 'lucide-react';
import { db, type AnalyticsOverview } from '../services/db';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatCard } from '../components/ui/StatCard';
import { EmptyState } from '../components/ui/EmptyState';

const PIE_COLORS = ['#F5B13D', '#38BDF8', '#34D399', '#F87171', '#A78BFA', '#FB923C', '#22D3EE', '#C084FC'];

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return [headers.join(','), ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? '')}"`).join(','))].join('\n');
}

export default function AnalyticsView() {
  const navigate = useNavigate();
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [realtime, setRealtime] = useState<{ activeConvs: number; msgsMin: number; errsMin: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    db.getAnalyticsOverview().then((d) => alive && setData(d)).catch(() => {}).finally(() => alive && setLoading(false));
    const poll = () => db.getRealtime().then((r) => alive && setRealtime(r)).catch(() => {});
    poll();
    const t = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const exportCSV = (rows: Record<string, unknown>[], name: string) => {
    const blob = new Blob([toCSV(rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportChart = (id: string, name: string) => {
    const svg = document.getElementById(id)?.querySelector('svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hourLabels = useMemo(() => Array.from({ length: 24 }, (_, h) => `${h}:00`), []);

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: 260, height: 30, marginBottom: 12 }} />
        <div className="dash-stats-grid">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 96, borderRadius: 10 }} />)}
        </div>
        <div className="skeleton" style={{ height: 300, borderRadius: 10 }} />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={<BarChartPlaceholder />}
        title="Analytics unavailable"
        description="The backend could not be reached. Start it and try again."
        action={<Button variant="primary" onClick={() => navigate('/')}>Back to dashboard</Button>}
      />
    );
  }

  const { overview, series, charts, unresolved } = data;

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: '0.5rem' }}>Insights</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8rem', marginBottom: '1.6rem' }}>
        Analytics
      </h1>

      {/* Overview cards */}
      <div className="dash-stats-grid">
        <StatCard value={overview.bots} label="Total bots" delay={0.03} />
        <StatCard value={overview.conversations} label="Conversations" delay={0.08} />
        <StatCard value={overview.messages} label="Messages" delay={0.13} />
        <StatCard value={overview.messagesToday} label="Messages today" delay={0.18} />
      </div>

      {/* Realtime strip */}
      <Card style={{ marginBottom: '1.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.14em', color: 'var(--fg-faint)' }}>
            <Activity style={{ width: 14, height: 14 }} /> LIVE · 5s
          </span>
          <span className="dash-provider online">Active conversations <b style={{ marginLeft: 6 }}>{realtime?.activeConvs ?? 0}</b></span>
          <span className="dash-provider online">Messages/min <b style={{ marginLeft: 6 }}>{realtime?.msgsMin ?? 0}</b></span>
          <span className={`dash-provider ${realtime && realtime.errsMin > 0 ? 'offline' : 'online'}`}>Errors/min <b style={{ marginLeft: 6 }}>{realtime?.errsMin ?? 0}</b></span>
          {overview.avgResponseMs != null && (
            <span className="dash-provider">Avg response <b style={{ marginLeft: 6 }}>{(overview.avgResponseMs / 1000).toFixed(1)}s</b></span>
          )}
          {overview.csat != null && (
            <span className="dash-provider online"><ThumbsUp style={{ width: 13, height: 13 }} /> CSAT <b style={{ marginLeft: 6 }}>{overview.csat}%</b></span>
          )}
        </div>
      </Card>

      {/* Conversations over time */}
      <Card id="chart-convs" style={{ marginBottom: '1.4rem' }}>
        <div className="dash-section-title">
          <span>Conversations over time (30d)</span>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <Button variant="ghost" size="sm" onClick={() => exportChart('chart-convs', 'conversations')}><Download /> SVG</Button>
            <Button variant="ghost" size="sm" onClick={() => exportCSV(series.conversations, 'conversations')}><Download /> CSV</Button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={series.conversations}>
            <defs>
              <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F5B13D" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#F5B13D" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="day" stroke="var(--fg-faint)" fontSize={10} tickFormatter={(d) => d.slice(5)} />
            <YAxis stroke="var(--fg-faint)" fontSize={10} allowDecimals={false} />
            <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-hover)', borderRadius: 8 }} />
            <Area type="monotone" dataKey="count" stroke="#F5B13D" fill="url(#convGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div className="dash-grid-2">
        {/* Provider donut */}
        <Card id="chart-provider">
          <div className="dash-section-title">
            <span>Messages by provider</span>
            <Button variant="ghost" size="sm" onClick={() => exportChart('chart-provider', 'providers')}><Download /> SVG</Button>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={charts.providerDist} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                {charts.providerDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-hover)', borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Top bots */}
        <Card id="chart-topbots">
          <div className="dash-section-title">
            <span>Top bots by usage</span>
            <Button variant="ghost" size="sm" onClick={() => exportCSV(charts.topBots, 'top-bots')}><Download /> CSV</Button>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={charts.topBots} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
              <XAxis type="number" stroke="var(--fg-faint)" fontSize={10} allowDecimals={false} />
              <YAxis type="category" dataKey="name" stroke="var(--fg-faint)" fontSize={10} width={110} />
              <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-hover)', borderRadius: 8 }} />
              <Bar dataKey="value" fill="#38BDF8" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="dash-grid-2">
        {/* CSAT trend */}
        <Card id="chart-csat">
          <div className="dash-section-title"><span>CSAT trend (7d)</span></div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={series.csat}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="day" stroke="var(--fg-faint)" fontSize={10} />
              <YAxis domain={[0, 100]} stroke="var(--fg-faint)" fontSize={10} />
              <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-hover)', borderRadius: 8 }} />
              <Line type="monotone" dataKey="csat" stroke="#34D399" strokeWidth={2} connectNulls dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Response-time histogram */}
        <Card id="chart-resp">
          <div className="dash-section-title"><span>Response time histogram</span></div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={charts.respHist}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--fg-faint)" fontSize={10} />
              <YAxis stroke="var(--fg-faint)" fontSize={10} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-hover)', borderRadius: 8 }} />
              <Bar dataKey="value" fill="#A78BFA" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="dash-grid-2">
        {/* Domain distribution */}
        <Card id="chart-domain">
          <div className="dash-section-title">
            <span>Domain distribution</span>
            <Button variant="ghost" size="sm" onClick={() => exportCSV(charts.domainDist, 'domains')}><Download /> CSV</Button>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={charts.domainDist} dataKey="value" nameKey="name" outerRadius={75} label={({ name }) => String(name).slice(0, 10)}>
                {charts.domainDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-hover)', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Conversation length */}
        <Card id="chart-convlen">
          <div className="dash-section-title"><span>Conversation length</span></div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={charts.convLenHist}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--fg-faint)" fontSize={10} />
              <YAxis stroke="var(--fg-faint)" fontSize={10} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-hover)', borderRadius: 8 }} />
              <Bar dataKey="value" fill="#FB923C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Peak-usage heatmap */}
      <Card id="chart-heatmap" style={{ marginBottom: '1.4rem' }}>
        <div className="dash-section-title"><span>Peak usage (hour × weekday)</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(7, 1fr)', gap: 3 }}>
          {hourLabels.map((h, i) => (
            <div key={h} style={{ gridColumn: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 9, color: 'var(--fg-faint)', paddingRight: 6 }}>
              {i % 4 === 0 ? h : ''}
            </div>
          ))}
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--fg-faint)', paddingBottom: 4 }}>{d}</div>
          ))}
          {charts.heatmap.flatMap((row) =>
            ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => {
              const v = row[d as keyof typeof row] as number;
              const max = Math.max(1, ...charts.heatmap.map((r) => Math.max(1, r.Mon, r.Tue, r.Wed, r.Thu, r.Fri, r.Sat, r.Sun)));
              const alpha = Math.min(1, v / max);
              return (
                <div key={`${row.hour}-${d}`} title={`${row.hour}:00 ${d} — ${v}`} style={{
                  height: 16, borderRadius: 3,
                  background: v > 0 ? `rgba(245,177,61,${0.15 + alpha * 0.85})` : 'var(--bg-tertiary)',
                }} />
              );
            })
          )}
        </div>
      </Card>

      {/* Unresolved queries */}
      <Card>
        <div className="dash-section-title"><span>Unresolved queries (Domain Guard redirects)</span></div>
        {unresolved.length === 0 ? (
          <p style={{ color: 'var(--fg-faint)', fontSize: '0.85rem' }}>No off-topic redirects yet — the guards are working quietly.</p>
        ) : (
          <div>
            {unresolved.map((u, i) => (
              <div className="activity-item" key={i}>
                <span className="a-type">redirected</span>
                <span className="a-who">{u.content.slice(0, 100)}{u.content.length > 100 ? '…' : ''}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function BarChartPlaceholder() {
  return <BotIcon style={{ width: 48, height: 48, color: 'var(--fg-faint)' }} />;
}
