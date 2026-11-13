import type { AdRow, BreakdownRow, CampaignRow, DailyPoint, DateRange, MetaData, MetaTotals } from './types';
import { previousRange } from './dates';
import { campaignFilter } from './filter';

const API = 'https://graph.facebook.com/v21.0';

type Action = { action_type: string; value: string };

// Ordem de preferência: o primeiro tipo encontrado é usado (evita contar o mesmo lead duas vezes).
// `lead` é o total que o Gerenciador mostra (formulário + site).
const LEAD_FORM = ['onsite_conversion.lead_grouped', 'leadgen_grouped', 'leadgen.other'];
const LEAD_SITE = ['offsite_conversion.fb_pixel_lead'];
const LANDING = ['landing_page_view', 'omni_landing_page_view'];

function pick(list: Action[] | undefined, types: string[]): number {
  if (!list) return 0;
  for (const t of types) {
    const a = list.find((x) => x.action_type === t);
    if (a) return parseFloat(a.value) || 0;
  }
  return 0;
}

const REGION_PT: Record<string, string> = { 'Federal District': 'Distrito Federal', Unknown: 'Não informado' };
const regionName = (name: string) => {
  const clean = name.replace(/\s*\((state|province|region)\)\s*$/i, '').trim();
  return REGION_PT[clean] ?? clean;
};

const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;

async function get(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();
  if (json.error) throw new Error(`Meta: ${json.error.message}`);
  // segue paginação (limite de segurança)
  let data = json.data ?? [];
  let next = json.paging?.next;
  for (let i = 0; next && i < 10; i++) {
    const r = await (await fetch(next, { cache: 'no-store' })).json();
    data = data.concat(r.data ?? []);
    next = r.paging?.next;
  }
  return data as any[];
}

function leadsOf(actions: Action[] | undefined) {
  const form = pick(actions, LEAD_FORM);
  const site = pick(actions, LEAD_SITE);
  // Sem o total `lead`, soma formulário + site
  const total = pick(actions, ['lead']) || form + site;
  return { total, form, site };
}

function toTotals(row: any): MetaTotals {
  const l = leadsOf(row?.actions);
  return {
    spend: num(row?.spend),
    impressions: num(row?.impressions),
    clicks: num(row?.inline_link_clicks ?? row?.clicks),
    reach: num(row?.reach),
    pageviews: pick(row?.actions, LANDING),
    leads: l.total,
    leadsForm: l.form,
    leadsSite: l.site,
  };
}

/** Ordem dos "melhores anúncios": leads, depois pageviews, depois cliques. */
const rankAds = (a: AdRow, b: AdRow) => b.leads - a.leads || b.pageviews - a.pageviews || b.clicks - a.clicks;

const BASE_FIELDS = 'spend,impressions,reach,inline_link_clicks,actions';

const OBJECTIVE: Record<string, string> = {
  OUTCOME_LEADS: 'Leads',
  OUTCOME_TRAFFIC: 'Tráfego',
  OUTCOME_AWARENESS: 'Reconhecimento',
  OUTCOME_ENGAGEMENT: 'Engajamento',
  OUTCOME_SALES: 'Vendas',
  LEAD_GENERATION: 'Leads',
  LINK_CLICKS: 'Tráfego',
};

function breakdown(rows: any[], key: string): BreakdownRow[] {
  return rows
    .map((r) => ({
      name: r[key] ?? 'Desconhecido',
      spend: num(r.spend),
      impressions: num(r.impressions),
      clicks: num(r.inline_link_clicks),
      pageviews: pick(r.actions, LANDING),
      leads: leadsOf(r.actions).total,
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

export async function fetchMeta(range: DateRange): Promise<MetaData> {
  const token = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) throw new Error('Meta: META_ACCESS_TOKEN ou META_AD_ACCOUNT_ID não configurado');
  const act = account.startsWith('act_') ? account : `act_${account}`;
  const prev = previousRange(range);
  const tr = (r: DateRange) => JSON.stringify({ since: r.start, until: r.end });
  // Só as campanhas dos leilões dos Correios (trecho do nome, sem diferenciar maiúsculas)
  const filtering = JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: campaignFilter() }]);
  const insights = (p: Record<string, string>) => get(`${act}/insights`, { limit: '500', filtering, ...p }, token);

  const [cur, before, daily, campaigns, ads, age, gender, region] = await Promise.all([
    insights({ time_range: tr(range), fields: BASE_FIELDS }),
    insights({ time_range: tr(prev), fields: BASE_FIELDS }),
    insights({ time_range: tr(range), time_increment: '1', fields: BASE_FIELDS }),
    insights({ time_range: tr(range), level: 'campaign', fields: `campaign_id,campaign_name,objective,${BASE_FIELDS}` }),
    insights({ time_range: tr(range), level: 'ad', fields: `ad_id,ad_name,campaign_id,${BASE_FIELDS}` }),
    insights({ time_range: tr(range), breakdowns: 'age', fields: BASE_FIELDS }),
    insights({ time_range: tr(range), breakdowns: 'gender', fields: BASE_FIELDS }),
    insights({ time_range: tr(range), breakdowns: 'region', fields: BASE_FIELDS }),
  ]);

  const dailyPoints: DailyPoint[] = daily.map((r) => ({ date: r.date_start, ...toTotals(r) }));

  const campaignRows: CampaignRow[] = campaigns
    .map((r) => ({ id: r.campaign_id, name: r.campaign_name, type: OBJECTIVE[r.objective] ?? r.objective, ...toTotals(r) }))
    .sort((a, b) => b.spend - a.spend);

  const topAds: AdRow[] = ads.map((r) => ({ id: r.ad_id, name: r.ad_name, campaignId: r.campaign_id, ...toTotals(r) })).sort(rankAds);

  // Miniaturas (a API aceita até 50 ids por chamada; limite de segurança de 500 anúncios)
  const chunks: AdRow[][] = [];
  for (let i = 0; i < Math.min(topAds.length, 500); i += 50) chunks.push(topAds.slice(i, i + 50));
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const url = new URL(API);
        url.searchParams.set('ids', chunk.map((a) => a.id).join(','));
        // Sem tamanho explícito a thumbnail_url vem em 64x64; pedimos 600x600 (cobre vídeos).
        url.searchParams.set('fields', 'creative.thumbnail_width(600).thumbnail_height(600){image_url,thumbnail_url}');
        url.searchParams.set('access_token', token);
        const thumbs = await (await fetch(url, { cache: 'no-store' })).json();
        for (const a of chunk) {
          const c = thumbs?.[a.id]?.creative;
          a.thumbnail = c?.image_url ?? c?.thumbnail_url;
        }
      } catch {
        /* miniaturas são opcionais */
      }
    }),
  );

  return {
    totals: toTotals(cur[0]),
    prev: toTotals(before[0]),
    daily: dailyPoints,
    campaigns: campaignRows,
    ads: topAds,
    // "Unknown" vira "N/I" e vai para o fim do gráfico de idade
    age: breakdown(age, 'age')
      .map((a) => ({ ...a, name: a.name.toLowerCase() === 'unknown' ? 'N/I' : a.name }))
      .sort((a, b) => Number(a.name === 'N/I') - Number(b.name === 'N/I') || a.name.localeCompare(b.name)),
    gender: breakdown(gender, 'gender').map((g) => ({
      ...g,
      name: g.name === 'female' ? 'Feminino' : g.name === 'male' ? 'Masculino' : 'Não informado',
    })),
    // A Meta devolve "São Paulo (state)", "Federal District"... deixa só o nome do estado em português
    region: breakdown(region, 'region')
      .map((r) => ({ ...r, name: regionName(r.name) }))
      .slice(0, 30),
  };
}
