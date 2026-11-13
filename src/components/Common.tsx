'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AdRow, CampaignRow, DailyPoint, Totals } from '@/lib/types';
import { brl, compact, dec, div, int, pct, shortDate } from '@/lib/format';
import { axis, C, Card, Column, DataTable, Kpi, Legend, METRIC, tooltipStyle } from './ui';

/** Leads podem vir fracionados do Google (atribuição): mostra decimais só quando existem. */
export const leadsFmt = (n: number) => (Number.isInteger(n) ? int(n) : dec(n));
const cost = (spend: number, n: number) => (n ? brl(spend / n) : '—');

/** Os seis indicadores do topo: leads e pageviews primeiro, com o custo de cada um. */
export function KpiRow({ t, p, daily }: { t: Totals; p: Totals; daily?: DailyPoint[] }) {
  const spark = (k: keyof Totals) => daily?.map((x) => x[k]);
  // Sem leads (ou pageviews) no período não existe custo unitário: não compara com o anterior
  const prevCost = (n: number, pn: number) => (n ? div(p.spend, pn) : 0);
  return (
    <div className="grid kpis">
      <Kpi label="Leads" value={leadsFmt(t.leads)} cur={t.leads} prev={p.leads} color={METRIC.leads} spark={spark('leads')} />
      <Kpi label="Custo por lead" value={cost(t.spend, t.leads)} cur={div(t.spend, t.leads)} prev={prevCost(t.leads, p.leads)} color={C.orange} invert />
      <Kpi label="Pageviews" value={int(t.pageviews)} cur={t.pageviews} prev={p.pageviews} color={METRIC.pageviews} spark={spark('pageviews')} />
      <Kpi label="Custo por pageview" value={cost(t.spend, t.pageviews)} cur={div(t.spend, t.pageviews)} prev={prevCost(t.pageviews, p.pageviews)} color={C.sky} invert />
      <Kpi label="Investimento" value={brl(t.spend)} cur={t.spend} prev={p.spend} color={C.navy} spark={spark('spend')} />
      <Kpi label="Cliques" value={int(t.clicks)} cur={t.clicks} prev={p.clicks} color={C.green} spark={spark('clicks')} />
    </div>
  );
}

/** Pageviews (barras) e leads (linha) por dia, cada um no seu eixo. */
export function LeadsPageviewsChart({ daily, height = 300 }: { daily: DailyPoint[]; height?: number }) {
  const series = daily.map((x) => ({ date: shortDate(x.date), pageviews: x.pageviews, leads: x.leads }));
  return (
    <>
      <div style={{ height }}>
        <ResponsiveContainer>
          <ComposedChart data={series} margin={{ top: 6, right: 0, left: -6, bottom: 0 }}>
            <CartesianGrid stroke="#eee" vertical={false} />
            <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={14} />
            <YAxis yAxisId="l" tick={axis} tickLine={false} axisLine={false} tickFormatter={compact} />
            <YAxis yAxisId="r" orientation="right" tick={axis} tickLine={false} axisLine={false} tickFormatter={compact} />
            <Tooltip {...tooltipStyle} formatter={(v, n) => (n === 'Leads' ? leadsFmt(Number(v)) : int(Number(v)))} />
            <Bar yAxisId="l" dataKey="pageviews" name="Pageviews" fill={METRIC.pageviews} radius={[4, 4, 0, 0]} opacity={0.8} />
            <Line yAxisId="r" dataKey="leads" name="Leads" stroke={METRIC.leads} strokeWidth={3} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend items={[{ label: 'Pageviews (eixo esquerdo)', color: METRIC.pageviews }, { label: 'Leads (eixo direito)', color: METRIC.leads }]} />
    </>
  );
}

/** Funil impressão → clique → pageview, com os leads no fim (taxa sobre os cliques). */
export function Funnel({ t, pageviewLabel = 'Pageviews' }: { t: Totals; pageviewLabel?: string }) {
  const steps = [
    { l: 'Impressões', v: t.impressions, color: C.navy, rate: '' },
    { l: 'Cliques', v: t.clicks, color: '#1c5f96', rate: `${pct(div(t.clicks, t.impressions) * 100)} das impressões` },
    { l: pageviewLabel, v: t.pageviews, color: C.blue, rate: `${pct(div(t.pageviews, t.clicks) * 100)} dos cliques` },
    { l: 'Leads', v: t.leads, color: C.yellow, rate: `${pct(div(t.leads, t.clicks) * 100)} dos cliques` },
  ];
  return (
    <div className="funnel">
      {steps.map((s, i) => (
        <div key={s.l} style={{ display: 'contents' }}>
          {i > 0 && <div className="rate">{s.rate}</div>}
          <div className="step" style={{ background: s.color, color: s.color === C.yellow ? '#002f4f' : '#fff', width: `${100 - i * 14}%` }}>
            <div className="l">{s.l}</div>
            <div className="v">{s.v >= 100000 ? compact(s.v) : leadsFmt(s.v)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Colunas de métricas usadas nas tabelas de campanhas, anúncios e plataformas. */
export function metricColumns<T extends Totals>(): Column<T>[] {
  return [
    { key: 'l', label: 'Leads', num: true, render: (r) => leadsFmt(r.leads), value: (r) => r.leads, heat: METRIC.leads },
    // Sem leads não há custo por lead: mostra "—" e fica sempre no fim ao ordenar
    { key: 'cpl', label: 'Custo/lead', num: true, lowerIsBetter: true, render: (r) => cost(r.spend, r.leads), value: (r) => (r.leads ? r.spend / r.leads : Infinity) },
    { key: 'pv', label: 'Pageviews', num: true, render: (r) => int(r.pageviews), value: (r) => r.pageviews, heat: METRIC.pageviews },
    { key: 'cpv', label: 'Custo/pageview', num: true, lowerIsBetter: true, render: (r) => cost(r.spend, r.pageviews), value: (r) => (r.pageviews ? r.spend / r.pageviews : Infinity) },
    { key: 's', label: 'Investimento', num: true, render: (r) => brl(r.spend), value: (r) => r.spend },
    { key: 'i', label: 'Impressões', num: true, render: (r) => int(r.impressions), value: (r) => r.impressions },
    { key: 'c', label: 'Cliques', num: true, render: (r) => int(r.clicks), value: (r) => r.clicks },
    { key: 'ctr', label: 'CTR', num: true, render: (r) => pct(div(r.clicks, r.impressions) * 100), value: (r) => div(r.clicks, r.impressions) },
  ];
}

const campaignName = (r: CampaignRow) => (
  <>
    {r.name}
    {r.type && <span className="sub">{r.type}</span>}
  </>
);

/**
 * Tabela de campanhas. Com `ads`, mostra também os melhores anúncios e abre os anúncios da campanha clicada.
 * `ads` deve vir ordenado do melhor para o pior e com `campaignId` preenchido.
 */
export function CampaignExplorer({ campaigns, ads }: { campaigns: CampaignRow[]; ads?: AdRow[] }) {
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const adsRef = useRef<HTMLDivElement>(null);
  const campaign = campaigns.find((c) => c.id && c.id === campaignId);
  const campaignAds = useMemo(() => (ads ?? []).filter((a) => a.campaignId === campaignId), [ads, campaignId]);

  const openCampaign = (id: string | null) => {
    setCampaignId(id);
    if (id) requestAnimationFrame(() => adsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  // Fecha o detalhe se a campanha sumir ao trocar o período
  useEffect(() => {
    if (campaignId && !campaigns.some((c) => c.id === campaignId)) setCampaignId(null);
  }, [campaigns, campaignId]);

  return (
    <>
      {ads && (
        <div className="row">
          <Card title="Melhores anúncios · por leads">
            {ads.length ? (
              <div className="ads best">
                {ads.slice(0, 6).map((a) => (
                  <div className="ad" key={a.id}>
                    <div className="thumb">
                      {a.thumbnail ? (
                        <a href={a.thumbnail} target="_blank" rel="noreferrer" title="Abrir a imagem em tamanho maior">
                          <img src={a.thumbnail} alt={a.name} loading="lazy" />
                        </a>
                      ) : (
                        'Sem prévia'
                      )}
                    </div>
                    <div className="info">
                      <div className="n" title={a.name}>{a.name}</div>
                      <div className="m">
                        {leadsFmt(a.leads)} leads · {cost(a.spend, a.leads)} por lead
                      </div>
                      <div className="m">
                        {int(a.pageviews)} pageviews · {brl(a.spend)} investidos
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">Sem anúncios no período</div>
            )}
          </Card>
        </div>
      )}

      <div className="row">
        <Card title="Campanhas">
          <p className="hint">{ads ? 'Clique em uma campanha para ver os anúncios dela. ' : ''}Clique no título de uma coluna para ordenar.</p>
          <DataTable
            rows={campaigns}
            sortable
            onRowClick={ads ? (r) => openCampaign(r.id && r.id === campaignId ? null : r.id ?? null) : undefined}
            isSelected={(r) => !!r.id && r.id === campaignId}
            columns={[{ key: 'n', label: 'Campanha', render: campaignName, sort: (r) => r.name }, ...metricColumns<CampaignRow>()]}
          />
        </Card>
      </div>

      {campaign && (
        <div ref={adsRef} className="row">
          <Card title={`Anúncios da campanha (${campaignAds.length})`}>
            <div className="filter-chip">
              <b title={campaign.name}>{campaign.name}</b>
              <button type="button" onClick={() => setCampaignId(null)}>
                Fechar ✕
              </button>
            </div>
            <DataTable
              rows={campaignAds}
              sortable
              empty="Nenhum anúncio com veiculação nesta campanha no período"
              columns={[
                {
                  key: 'img',
                  label: '',
                  cls: 'thumb-cell',
                  render: (a) => (a.thumbnail ? <img src={a.thumbnail} alt="" loading="lazy" /> : <span className="no-thumb">—</span>),
                },
                { key: 'n', label: 'Anúncio', cls: 'name', render: (a) => a.name, sort: (a) => a.name },
                ...metricColumns<AdRow>(),
              ]}
            />
          </Card>
        </div>
      )}
    </>
  );
}
