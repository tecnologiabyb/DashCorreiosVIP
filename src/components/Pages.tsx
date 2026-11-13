'use client';

import type { GoogleCampaignRow, GoogleData, LinkedInData, MetaAdsetRow, MetaData, Row, SearchTermRow, Totals, VideoRow } from '@/lib/types';
import { dec, div, int, pct } from '@/lib/format';
import { C, Card, Column, DataTable, Kpi } from './ui';

// Estrutura espelhada no "Cockpit de Growth Correios" (Data Studio): em cada página,
// "Dados Gerais" com os indicadores e, abaixo, a visão por campanha ou conjunto de anúncio.

/** Leads podem vir fracionados (atribuição): mostra decimais só quando existem. */
const leadsFmt = (n: number) => (Number.isInteger(n) ? int(n) : dec(n));
const ctr = (r: { clicks: number; impressions: number }) => div(r.clicks, r.impressions) * 100;
const BAR = '#6ea8e8';

/** Parcela de impressões na parte superior: o Google informa "menos de 10%" como 0,0999. */
const topShare = (v: number | undefined) => (v === undefined ? '—' : v < 0.1 ? '< 10%' : pct(v * 100));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="block">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** Colunas comuns às tabelas do relatório: impressões, cliques e CTR, com barra em cada uma. */
function baseColumns<T extends Row>(first: string): Column<T>[] {
  return [
    { key: 'n', label: first, render: (r) => r.name, sort: (r) => r.name },
    { key: 'i', label: 'Impressões', num: true, render: (r) => int(r.impressions), value: (r) => r.impressions, heat: BAR },
    { key: 'c', label: 'Cliques', num: true, render: (r) => int(r.clicks), value: (r) => r.clicks, heat: BAR },
    // Sem impressões não há CTR
    { key: 'ctr', label: 'CTR', num: true, render: (r) => (r.impressions ? pct(ctr(r)) : '—'), value: (r) => ctr(r), heat: BAR },
  ];
}

const leadsColumn = <T extends Row>(): Column<T> => ({ key: 'l', label: 'Leads', num: true, render: (r) => leadsFmt(r.leads), value: (r) => r.leads, heat: BAR });

export function MetaPage({ m }: { m: MetaData }) {
  const t = m.totals;
  const p = m.prev;
  const rate = (x: typeof t) => div(x.leads, x.leadLinkClicks) * 100;
  return (
    <>
      <Section title="Dados Gerais">
        <div className="grid kpis k4">
          <Kpi label="Impressões" value={int(t.impressions)} cur={t.impressions} prev={p.impressions} color={C.blue} />
          <Kpi label="Cliques" value={int(t.clicks)} cur={t.clicks} prev={p.clicks} color={C.blue} />
          <Kpi label="Leads" value={leadsFmt(t.leads)} cur={t.leads} prev={p.leads} color={C.yellow} />
          <Kpi label="Taxa de Conversão" value={pct(rate(t))} cur={rate(t)} prev={rate(p)} color={C.green} />
        </div>
      </Section>

      <Section title="Visão de Leads por Conjunto de Anúncio">
        <Card className="full">
          <DataTable rows={m.leadAdsets} sortable empty="Nenhum conjunto de leads com veiculação no período" columns={[...baseColumns<MetaAdsetRow>('Conjunto de Anúncio'), leadsColumn<MetaAdsetRow>()]} />
        </Card>
      </Section>

      <Section title="Visão de Tráfego por Conjunto de Anúncio">
        <Card className="full">
          <DataTable
            rows={m.trafficAdsets}
            sortable
            empty="Nenhum conjunto de tráfego com veiculação no período"
            columns={[
              ...baseColumns<MetaAdsetRow>('Conjunto de Anúncio'),
              { key: 'pv', label: 'Visualização de Página de Destino', num: true, render: (r) => int(r.pageviews), value: (r) => r.pageviews, heat: BAR },
            ]}
          />
        </Card>
        <p className="note">
          Cliques = todos os cliques do anúncio. Leads = formulário instantâneo + evento de lead do pixel. Taxa de conversão = leads ÷ cliques no link dos conjuntos de
          leads.
        </p>
      </Section>
    </>
  );
}

export function GooglePage({ g }: { g: GoogleData }) {
  const t = g.ads.totals;
  const p = g.ads.prev;
  return (
    <>
      <Section title="Dados Gerais">
        <div className="grid kpis k4">
          <Kpi label="Impressões" value={int(t.impressions)} cur={t.impressions} prev={p.impressions} color={C.blue} />
          <Kpi label="CTR" value={pct(ctr(t))} cur={ctr(t)} prev={ctr(p)} color={C.green} />
          <Kpi label="% Share Top Google Ads" value={topShare(t.topShare)} cur={(t.topShare ?? 0) * 100} prev={(p.topShare ?? 0) * 100} color={C.yellow} />
          <Kpi label="Cliques" value={int(t.clicks)} cur={t.clicks} prev={p.clicks} color={C.blue} />
        </div>
      </Section>

      <Section title="Dados por Campanhas">
        <Card className="full">
          <DataTable
            rows={g.ads.campaigns}
            sortable
            empty="Nenhuma campanha com veiculação no período"
            columns={[
              { key: 'n', label: 'Campanha', render: (r) => r.name, sort: (r) => r.name },
              { key: 'i', label: 'Impressões', num: true, render: (r) => int(r.impressions), value: (r) => r.impressions, heat: BAR },
              { key: 'ctr', label: 'CTR', num: true, render: (r) => (r.impressions ? pct(ctr(r)) : '—'), value: (r) => ctr(r), heat: BAR },
              { key: 'ts', label: '% Share Top', num: true, render: (r) => topShare(r.topShare), value: (r) => r.topShare ?? 0, heat: BAR },
              { key: 'c', label: 'Cliques', num: true, render: (r) => int(r.clicks), value: (r) => r.clicks, heat: BAR },
            ] satisfies Column<GoogleCampaignRow>[]}
          />
        </Card>
        <p className="note">
          % Share Top = parcela de impressões na parte superior da pesquisa: de todas as vezes em que o anúncio poderia aparecer acima dos resultados orgânicos, em
          quantas apareceu. Campanhas de Vídeo e Demand Gen ficam na página YouTube.
        </p>
      </Section>

      <Section title="Search term">
        <Card>
          <DataTable
            rows={g.terms}
            sortable
            empty="Nenhum termo de pesquisa no período"
            columns={[
              { key: 'n', label: 'Termo de pesquisa', render: (r) => r.term, sort: (r) => r.term },
              { key: 'i', label: 'Impressões', num: true, render: (r) => int(r.impressions), value: (r) => r.impressions, heat: BAR },
              { key: 'ctr', label: 'CTR', num: true, render: (r) => (r.impressions ? pct(ctr(r)) : '—'), value: (r) => ctr(r), heat: BAR },
              { key: 'c', label: 'Cliques', num: true, render: (r) => int(r.clicks), value: (r) => r.clicks, heat: BAR },
            ] satisfies Column<SearchTermRow>[]}
          />
        </Card>
        <p className="note">Os {g.terms.length} termos mais clicados no período. O Google não informa a parcela de impressões por termo de pesquisa.</p>
      </Section>
    </>
  );
}

export function YouTubePage({ g }: { g: GoogleData }) {
  const t = g.youtube.totals;
  const p = g.youtube.prev;
  return (
    <>
      <Section title="Dados Gerais">
        <div className="grid kpis k3">
          <Kpi label="Impressões" value={int(t.impressions)} cur={t.impressions} prev={p.impressions} color={C.blue} />
          <Kpi label="Cliques" value={int(t.clicks)} cur={t.clicks} prev={p.clicks} color={C.blue} />
          <Kpi label="CTR" value={pct(ctr(t))} cur={ctr(t)} prev={ctr(p)} color={C.green} />
        </div>
      </Section>

      <Section title="Vídeos">
        <Card className="full">
          <DataTable
            rows={g.videos}
            sortable
            empty="Nenhum vídeo com veiculação no período"
            columns={[
              {
                key: 'thumb',
                label: 'Thumb',
                cls: 'video-thumb',
                render: (v) => (
                  <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" title="Abrir o vídeo no YouTube">
                    <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" />
                  </a>
                ),
              },
              { key: 'n', label: 'Título', cls: 'name', render: (v) => v.title, sort: (v) => v.title },
              { key: 'v', label: 'Visualizações', num: true, render: (v) => int(v.views), value: (v) => v.views, heat: BAR },
            ] satisfies Column<VideoRow>[]}
          />
        </Card>
        <p className="note">Vídeos das campanhas de Vídeo e Demand Gen da conta Vip Leilões com “correios” no nome.</p>
      </Section>
    </>
  );
}

export function LinkedInPage({ l }: { l: LinkedInData }) {
  const t: Totals = l.totals;
  const p: Totals = l.prev;
  return (
    <>
      <Section title="Dados Gerais">
        <div className="grid kpis k3">
          <Kpi label="Impressões" value={int(t.impressions)} cur={t.impressions} prev={p.impressions} color={C.blue} />
          <Kpi label="Cliques" value={int(t.clicks)} cur={t.clicks} prev={p.clicks} color={C.blue} />
          <Kpi label="CTR" value={pct(ctr(t))} cur={ctr(t)} prev={ctr(p)} color={C.green} />
        </div>
      </Section>

      <Section title="Visão por Conjunto de Anúncio">
        <Card className="full">
          <DataTable rows={l.campaigns} sortable empty="Nenhum grupo de anúncio com veiculação no período" columns={[...baseColumns<Row>('Grupo de Anúncio'), leadsColumn<Row>()]} />
        </Card>
      </Section>
    </>
  );
}
