'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MetaData } from '@/lib/types';
import { brl, dec, div, int, pct } from '@/lib/format';
import { axis, Card, DataTable, Legend, METRIC, Stat, tooltipStyle } from './ui';
import { CampaignExplorer, Funnel, KpiRow, LeadsPageviewsChart, leadsFmt } from './Common';

export default function MetaView({ m }: { m: MetaData }) {
  const t = m.totals;
  const p = m.prev;

  return (
    <>
      <KpiRow t={t} p={p} daily={m.daily} />

      <div className="row r-funnel">
        <Card title="Funil">
          <Funnel t={t} pageviewLabel="Pageviews (página de destino)" />
          <div className="stats inline">
            <Stat label="Alcance" value={int(t.reach)} cur={t.reach} prev={p.reach} />
            <Stat label="Frequência" value={dec(div(t.impressions, t.reach))} />
            <Stat label="CPM" value={brl(div(t.spend, t.impressions) * 1000)} />
          </div>
        </Card>

        <Card title="Leads e pageviews por dia">
          <div className="stats inline col-on-mobile" style={{ marginBottom: 12 }}>
            <Stat label="Leads de formulário" value={leadsFmt(t.leadsForm)} cur={t.leadsForm} prev={p.leadsForm} />
            <Stat label="Leads no site (pixel)" value={leadsFmt(t.leadsSite)} cur={t.leadsSite} prev={p.leadsSite} />
            <Stat label="Pageviews ÷ cliques" value={pct(div(t.pageviews, t.clicks) * 100)} cur={div(t.pageviews, t.clicks)} prev={div(p.pageviews, p.clicks)} />
            <Stat label="Custo por clique" value={brl(div(t.spend, t.clicks))} cur={div(t.spend, t.clicks)} prev={div(p.spend, p.clicks)} invert />
          </div>
          <LeadsPageviewsChart daily={m.daily} height={250} />
        </Card>
      </div>

      <div className="row r-3">
        <Card title="Faixa etária">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={m.age} margin={{ top: 16, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#eee" vertical={false} />
              <XAxis dataKey="name" tick={{ ...axis, fontSize: 10 }} tickLine={false} axisLine={false} interval={0} />
              <YAxis tick={axis} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} formatter={(v, n) => [leadsFmt(Number(v)), n]} cursor={{ fill: '#eef3f7' }} />
              <Bar dataKey="pageviews" name="Pageviews" fill={METRIC.pageviews} radius={[4, 4, 0, 0]} />
              <Bar dataKey="leads" name="Leads" fill={METRIC.leads} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <Legend items={[{ label: 'Pageviews', color: METRIC.pageviews }, { label: 'Leads', color: METRIC.leads }]} />
        </Card>

        <Card title="Gênero">
          <DataTable
            rows={m.gender}
            columns={[
              { key: 'n', label: 'Gênero', render: (r) => r.name },
              { key: 'l', label: 'Leads', num: true, render: (r) => leadsFmt(r.leads), value: (r) => r.leads, heat: METRIC.leads },
              { key: 'cpl', label: 'Custo/lead', num: true, render: (r) => (r.leads ? brl(r.spend / r.leads) : '—') },
              { key: 'pv', label: 'Pageviews', num: true, render: (r) => int(r.pageviews), value: (r) => r.pageviews, heat: METRIC.pageviews },
            ]}
          />
        </Card>

        <Card title="Estado">
          <DataTable
            rows={m.region}
            sortable
            columns={[
              { key: 'n', label: 'Estado', render: (r) => r.name, sort: (r) => r.name },
              { key: 'l', label: 'Leads', num: true, render: (r) => leadsFmt(r.leads), value: (r) => r.leads, heat: METRIC.leads },
              { key: 'pv', label: 'Pageviews', num: true, render: (r) => int(r.pageviews), value: (r) => r.pageviews, heat: METRIC.pageviews },
            ]}
          />
        </Card>
      </div>

      <CampaignExplorer campaigns={m.campaigns} ads={m.ads} />
    </>
  );
}
