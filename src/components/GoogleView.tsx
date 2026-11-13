'use client';

import type { GoogleData } from '@/lib/types';
import { brl, div, int, pct } from '@/lib/format';
import { C, Card, DataTable, METRIC, Stat } from './ui';
import { CampaignExplorer, Funnel, KpiRow, LeadsPageviewsChart, leadsFmt } from './Common';

export default function GoogleView({ g }: { g: GoogleData }) {
  const t = g.totals;
  const p = g.prev;

  return (
    <>
      <KpiRow t={t} p={p} daily={g.daily} />

      <div className="row r-funnel">
        <Card title="Funil">
          <Funnel t={t} />
          <div className="stats inline">
            <Stat label="CTR" value={pct(div(t.clicks, t.impressions) * 100)} cur={div(t.clicks, t.impressions)} prev={div(p.clicks, p.impressions)} />
            <Stat label="Custo por clique" value={brl(div(t.spend, t.clicks))} cur={div(t.spend, t.clicks)} prev={div(p.spend, p.clicks)} invert />
          </div>
        </Card>

        <Card title="Leads e pageviews por dia">
          <LeadsPageviewsChart daily={g.daily} height={290} />
          <p className="note">
            Leads = {g.leadActions.length ? g.leadActions.map((a) => `“${a}”`).join(', ') : 'nenhuma ação configurada'}. Pageviews ={' '}
            {g.pageviewActions.length ? g.pageviewActions.map((a) => `“${a}”`).join(', ') : 'nenhuma ação configurada'}. Os números vêm de “todas as
            conversões” do Google Ads.
            {t.pageviews === 0 && t.clicks > 0 && ' A ação de pageview não registrou nada nestas campanhas no período: use os cliques como referência de visitas.'}
          </p>
        </Card>
      </div>

      <div className="row r-google-2">
        <Card title="Palavras-chave">
          <DataTable
            rows={g.keywords}
            sortable
            empty="Sem palavras-chave com impressões no período"
            columns={[
              { key: 'k', label: 'Palavra-chave', render: (r) => r.keyword, sort: (r) => r.keyword },
              { key: 'l', label: 'Leads', num: true, render: (r) => leadsFmt(r.leads), value: (r) => r.leads, heat: METRIC.leads },
              { key: 'c', label: 'Cliques', num: true, render: (r) => int(r.clicks), value: (r) => r.clicks, heat: C.green },
              { key: 'ctr', label: 'CTR', num: true, render: (r) => pct(div(r.clicks, r.impressions) * 100), value: (r) => div(r.clicks, r.impressions) },
              { key: 's', label: 'Investimento', num: true, render: (r) => brl(r.spend), value: (r) => r.spend },
              { key: 'cpc', label: 'CPC', num: true, lowerIsBetter: true, render: (r) => brl(div(r.spend, r.clicks)), value: (r) => (r.clicks ? r.spend / r.clicks : Infinity) },
            ]}
          />
        </Card>

        <Card title="Termos de pesquisa">
          <DataTable
            rows={g.terms}
            sortable
            empty="Sem termos de pesquisa no período"
            columns={[
              { key: 'k', label: 'Termo', render: (r) => r.term, sort: (r) => r.term },
              { key: 'l', label: 'Leads', num: true, render: (r) => leadsFmt(r.leads), value: (r) => r.leads, heat: METRIC.leads },
              { key: 'c', label: 'Cliques', num: true, render: (r) => int(r.clicks), value: (r) => r.clicks, heat: C.green },
              { key: 'ctr', label: 'CTR', num: true, render: (r) => pct(div(r.clicks, r.impressions) * 100), value: (r) => div(r.clicks, r.impressions) },
              { key: 's', label: 'Investimento', num: true, render: (r) => brl(r.spend), value: (r) => r.spend },
            ]}
          />
        </Card>
      </div>

      <div className="row">
        <Card title="Dispositivo">
          <DataTable
            rows={g.device}
            columns={[
              { key: 'n', label: 'Dispositivo', render: (r) => r.name },
              { key: 'l', label: 'Leads', num: true, render: (r) => leadsFmt(r.leads), value: (r) => r.leads, heat: METRIC.leads },
              { key: 'cpl', label: 'Custo/lead', num: true, render: (r) => (r.leads ? brl(r.spend / r.leads) : '—') },
              { key: 'pv', label: 'Pageviews', num: true, render: (r) => int(r.pageviews), value: (r) => r.pageviews, heat: METRIC.pageviews },
              { key: 'c', label: 'Cliques', num: true, render: (r) => int(r.clicks), value: (r) => r.clicks, heat: C.green },
              { key: 's', label: 'Investimento', num: true, render: (r) => brl(r.spend) },
            ]}
          />
        </Card>
      </div>

      <CampaignExplorer campaigns={g.campaigns} />
    </>
  );
}
