'use client';

import type { LinkedInData } from '@/lib/types';
import { brl, div, pct } from '@/lib/format';
import { Card, Stat } from './ui';
import { CampaignExplorer, Funnel, KpiRow, LeadsPageviewsChart, leadsFmt } from './Common';

export default function LinkedInView({ l }: { l: LinkedInData }) {
  const t = l.totals;
  const p = l.prev;

  return (
    <>
      <KpiRow t={t} p={p} daily={l.daily} />

      <div className="row r-funnel">
        <Card title="Funil">
          <Funnel t={t} pageviewLabel="Cliques para a página" />
          <div className="stats inline">
            <Stat label="CTR" value={pct(div(t.clicks, t.impressions) * 100)} cur={div(t.clicks, t.impressions)} prev={div(p.clicks, p.impressions)} />
            <Stat label="CPM" value={brl(div(t.spend, t.impressions) * 1000)} />
          </div>
        </Card>

        <Card title="Leads e pageviews por dia">
          <div className="stats inline col-on-mobile" style={{ marginBottom: 12 }}>
            <Stat label="Leads de formulário" value={leadsFmt(t.leadsForm)} cur={t.leadsForm} prev={p.leadsForm} />
            <Stat label="Conversões no site" value={leadsFmt(t.leadsSite)} cur={t.leadsSite} prev={p.leadsSite} />
            <Stat label="Custo por clique" value={brl(div(t.spend, t.clicks))} cur={div(t.spend, t.clicks)} prev={div(p.spend, p.clicks)} invert />
          </div>
          <LeadsPageviewsChart daily={l.daily} height={250} />
          <p className="note">
            O LinkedIn não informa visualizações de página: “pageviews” aqui são os cliques que levaram à página de destino. Leads = formulários nativos +
            conversões registradas no site pela Insight Tag.
          </p>
        </Card>
      </div>

      <CampaignExplorer campaigns={l.campaigns} />
    </>
  );
}
