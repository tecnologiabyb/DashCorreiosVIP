'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CampaignRow, DashboardResponse, DailyPoint, Totals } from '@/lib/types';
import { brl, byWeekday, compact, div, int, pct, shortDate } from '@/lib/format';
import { axis, Card, DataTable, Legend, METRIC, PLATFORM, tooltipStyle } from './ui';
import { KpiRow, LeadsPageviewsChart, leadsFmt, metricColumns } from './Common';

const ZERO: Totals = { spend: 0, impressions: 0, clicks: 0, pageviews: 0, leads: 0 };

function add(a: Totals, b: Totals): Totals {
  return {
    spend: a.spend + b.spend,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    pageviews: a.pageviews + b.pageviews,
    leads: a.leads + b.leads,
  };
}

type PlatformRow = Totals & { name: string; color: string; prev: Totals };

export default function Overview({ d }: { d: DashboardResponse }) {
  const m = d.meta.data;
  const g = d.google.data;
  // LinkedIn só entra nos totais quando está configurado (sem dados de exemplo)
  const li = d.linkedin?.data ?? null;

  const platforms: PlatformRow[] = [
    { name: 'Meta Ads', color: PLATFORM.meta, ...m.totals, prev: m.prev },
    { name: 'Google Ads', color: PLATFORM.google, ...g.totals, prev: g.prev },
    ...(li ? [{ name: 'LinkedIn Ads', color: PLATFORM.linkedin, ...li.totals, prev: li.prev }] : []),
  ];
  const cur = platforms.reduce<Totals>(add, ZERO);
  const prev = platforms.map((p) => p.prev).reduce<Totals>(add, ZERO);

  // Série diária: total combinado e cada plataforma separada
  const sources: { key: 'meta' | 'google' | 'linkedin'; daily: DailyPoint[] }[] = [
    { key: 'meta', daily: m.daily },
    { key: 'google', daily: g.daily },
    ...(li ? [{ key: 'linkedin' as const, daily: li.daily }] : []),
  ];
  const dates = Array.from(new Set(sources.flatMap((s) => s.daily.map((x) => x.date)))).sort();
  const at = (rows: DailyPoint[], date: string) => rows.find((x) => x.date === date);
  const combined: DailyPoint[] = dates.map((date) => ({ date, ...sources.map((s) => at(s.daily, date) ?? ZERO).reduce<Totals>(add, ZERO) }));
  const perPlatform = (k: 'leads' | 'pageviews') =>
    dates.map((date) => ({ date: shortDate(date), ...Object.fromEntries(sources.map((s) => [s.key, at(s.daily, date)?.[k] ?? 0])) }));

  const bars = sources.map((s) => ({ key: s.key, name: s.key === 'meta' ? 'Meta Ads' : s.key === 'google' ? 'Google Ads' : 'LinkedIn Ads', color: PLATFORM[s.key] }));
  const legend = bars.map((b) => ({ label: b.name, color: b.color }));

  const campaigns: (CampaignRow & { platform: string; color: string })[] = [
    ...m.campaigns.map((c) => ({ ...c, platform: 'Meta', color: PLATFORM.meta })),
    ...g.campaigns.map((c) => ({ ...c, platform: 'Google', color: PLATFORM.google })),
    ...(li?.campaigns ?? []).map((c) => ({ ...c, platform: 'LinkedIn', color: PLATFORM.linkedin })),
  ].sort((a, b) => b.leads - a.leads || b.pageviews - a.pageviews);

  const stacked = (data: Record<string, unknown>[], label: string) => (
    <>
      <div style={{ height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 6, right: 4, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="#eee" vertical={false} />
            <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={14} />
            <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={compact} />
            <Tooltip {...tooltipStyle} formatter={(v) => leadsFmt(Number(v))} cursor={{ fill: '#eef3f7' }} />
            {bars.map((b, i) => (
              <Bar key={b.key} dataKey={b.key} name={b.name} stackId="a" fill={b.color} radius={i === bars.length - 1 ? [4, 4, 0, 0] : 0} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend items={legend.map((l) => ({ ...l, label: `${label} · ${l.label}` }))} />
    </>
  );

  return (
    <>
      <KpiRow t={cur} p={prev} daily={combined} />

      <div className="row">
        <Card title="Leads e pageviews por dia · todas as plataformas">
          <LeadsPageviewsChart daily={combined} />
        </Card>
      </div>

      <div className="row">
        <Card title="Resultado por plataforma">
          <DataTable
            rows={platforms}
            columns={[
              {
                key: 'n',
                label: 'Plataforma',
                render: (r) => (
                  <span className="pf">
                    <i style={{ background: r.color }} />
                    {r.name}
                  </span>
                ),
              },
              ...metricColumns<PlatformRow>(),
              { key: 'sl', label: '% dos leads', num: true, render: (r) => pct(div(r.leads, cur.leads) * 100) },
              { key: 'sp', label: '% dos pageviews', num: true, render: (r) => pct(div(r.pageviews, cur.pageviews) * 100) },
              { key: 'ss', label: '% do investimento', num: true, render: (r) => pct(div(r.spend, cur.spend) * 100) },
            ]}
          />
          {!li && <p className="note">LinkedIn Ads ainda não está conectado: os totais somam Meta + Google.</p>}
        </Card>
      </div>

      <div className="row r-2">
        <Card title="Leads por dia e plataforma">{stacked(perPlatform('leads'), 'Leads')}</Card>
        <Card title="Pageviews por dia e plataforma">{stacked(perPlatform('pageviews'), 'Pageviews')}</Card>
      </div>

      <div className="row r-2">
        <Card title="Leads por dia da semana">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byWeekday(combined, 'leads')} margin={{ top: 16, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#eee" vertical={false} />
              <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} interval={0} />
              <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={compact} />
              <Tooltip {...tooltipStyle} formatter={(v) => [leadsFmt(Number(v)), 'Leads']} cursor={{ fill: '#fff6d6' }} />
              <Bar dataKey="value" fill={METRIC.leads} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Pageviews por dia da semana">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byWeekday(combined, 'pageviews')} margin={{ top: 16, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#eee" vertical={false} />
              <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} interval={0} />
              <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={compact} />
              <Tooltip {...tooltipStyle} formatter={(v) => [int(Number(v)), 'Pageviews']} cursor={{ fill: '#eef3f7' }} />
              <Bar dataKey="value" fill={METRIC.pageviews} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="row">
        <Card title="Campanhas · todas as plataformas">
          <p className="hint">Ordenadas por leads. Clique no título de uma coluna para reordenar.</p>
          <DataTable
            rows={campaigns}
            sortable
            columns={[
              {
                key: 'n',
                label: 'Campanha',
                sort: (r) => r.name,
                render: (r) => (
                  <>
                    {r.name}
                    <span className="sub">
                      {r.platform}
                      {r.type ? ` · ${r.type}` : ''}
                    </span>
                  </>
                ),
              },
              ...metricColumns<CampaignRow & { platform: string; color: string }>(),
            ]}
          />
          <p className="note">
            Investimento total no período: <b>{brl(cur.spend)}</b>. Entram só as campanhas com “{d.filter}” no nome.
          </p>
        </Card>
      </div>
    </>
  );
}
