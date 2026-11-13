import type { BreakdownRow, CampaignRow, DailyPoint, DateRange, GoogleData, KeywordRow, SearchTermRow, Totals } from './types';
import { previousRange } from './dates';
import { campaignFilter } from './filter';

const API = 'https://googleads.googleapis.com/v23';

let cachedToken: { value: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now()) return cachedToken.value;
  const { GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_ADS_CLIENT_ID || !GOOGLE_ADS_CLIENT_SECRET || !GOOGLE_ADS_REFRESH_TOKEN) {
    throw new Error('Google Ads: credenciais OAuth não configuradas');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_ADS_CLIENT_ID,
      client_secret: GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`Google Ads OAuth: ${json.error_description || json.error}`);
  cachedToken = { value: json.access_token, exp: Date.now() + (json.expires_in - 60) * 1000 };
  return json.access_token;
}

async function search(query: string): Promise<any[]> {
  const customer = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/-/g, '');
  const login = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '');
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!customer || !devToken) throw new Error('Google Ads: GOOGLE_ADS_CUSTOMER_ID ou DEVELOPER_TOKEN não configurado');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'developer-token': devToken,
    Authorization: `Bearer ${await accessToken()}`,
  };
  if (login && login !== customer) headers['login-customer-id'] = login;

  let rows: any[] = [];
  let pageToken: string | undefined;
  do {
    const res = await fetch(`${API}/customers/${customer}/googleAds:search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, pageToken }),
      cache: 'no-store',
    });
    const json = await res.json();
    if (json.error) throw new Error(`Google Ads: ${json.error.message}`);
    rows = rows.concat(json.results ?? []);
    pageToken = json.nextPageToken;
  } while (pageToken);
  return rows;
}

const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;

type Base = { spend: number; impressions: number; clicks: number };
const toBase = (m: any): Base => ({ spend: num(m?.costMicros) / 1e6, impressions: num(m?.impressions), clicks: num(m?.clicks) });

const METRICS = 'metrics.cost_micros, metrics.impressions, metrics.clicks';
const between = (r: DateRange) => `segments.date BETWEEN '${r.start}' AND '${r.end}'`;

/** Só as campanhas dos leilões dos Correios (trecho do nome, sem diferenciar maiúsculas). */
function onlyFiltered(): string {
  const f = campaignFilter().replace(/[^a-z0-9 _-]/g, '');
  return `campaign.name REGEXP_MATCH '(?i).*${f}.*'`;
}

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** Ações de conversão contadas como lead (cadastro, formulário) e como visualização de página. */
const leadActions = () => list(process.env.GOOGLE_ADS_LEAD_ACTIONS);
const pageviewActions = () => list(process.env.GOOGLE_ADS_PAGEVIEW_ACTIONS);

type Conv = { leads: number; pageviews: number };

/**
 * Soma leads e pageviews por chave, a partir das ações de conversão configuradas.
 * Usa "todas as conversões": nas campanhas de tráfego essas ações não entram na coluna "conversões".
 */
async function convBy(from: string, select: string, where: string, key: (r: any) => string): Promise<Map<string, Conv>> {
  const leads = new Set(leadActions().map((s) => s.toLowerCase()));
  const views = new Set(pageviewActions().map((s) => s.toLowerCase()));
  const map = new Map<string, Conv>();
  if (!leads.size && !views.size) return map;
  const rows = await search(`SELECT ${select ? `${select}, ` : ''}segments.conversion_action_name, metrics.all_conversions FROM ${from} WHERE ${where}`);
  for (const r of rows) {
    const action = String(r.segments?.conversionActionName ?? '').toLowerCase();
    const isLead = leads.has(action);
    const isView = views.has(action);
    if (!isLead && !isView) continue;
    const k = key(r);
    const e = map.get(k) ?? { leads: 0, pageviews: 0 };
    if (isLead) e.leads += num(r.metrics?.allConversions);
    if (isView) e.pageviews += num(r.metrics?.allConversions);
    map.set(k, e);
  }
  return map;
}

const NO_CONV: Conv = { leads: 0, pageviews: 0 };

const DEVICE: Record<string, string> = { MOBILE: 'Celular', DESKTOP: 'Computador', TABLET: 'Tablet', CONNECTED_TV: 'TV', OTHER: 'Outros' };

const CHANNEL: Record<string, string> = {
  SEARCH: 'Pesquisa',
  SHOPPING: 'Shopping',
  PERFORMANCE_MAX: 'Performance Max',
  DISPLAY: 'Display',
  VIDEO: 'Vídeo',
  DEMAND_GEN: 'Demand Gen',
};

/** Visões extras da aba Google: se uma delas falhar, o restante do painel continua. */
async function optional<T>(what: string, fn: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error(`Google Ads (${what}): ${e instanceof Error ? e.message : String(e)}`);
    return empty;
  }
}

/** Agrupa linhas por chave somando custo, impressões e cliques. */
function group(rows: any[], key: (r: any) => string): Map<string, Base> {
  const map = new Map<string, Base>();
  for (const r of rows) {
    const k = key(r);
    const b = toBase(r.metrics);
    const e = map.get(k) ?? { spend: 0, impressions: 0, clicks: 0 };
    e.spend += b.spend;
    e.impressions += b.impressions;
    e.clicks += b.clicks;
    map.set(k, e);
  }
  return map;
}

export async function fetchGoogle(range: DateRange): Promise<GoogleData> {
  const prev = previousRange(range);
  const only = onlyFiltered();
  const cur = `${between(range)} AND ${only}`;
  const before = `${between(prev)} AND ${only}`;

  const [daily, campaigns, prevRows, device] = await Promise.all([
    search(`SELECT segments.date, ${METRICS} FROM campaign WHERE ${cur}`),
    search(`SELECT campaign.id, campaign.name, campaign.advertising_channel_type, ${METRICS} FROM campaign WHERE ${cur} AND metrics.impressions > 0`),
    search(`SELECT ${METRICS} FROM campaign WHERE ${before}`),
    search(`SELECT segments.device, ${METRICS} FROM campaign WHERE ${cur}`),
  ]);

  const [cDaily, cCampaign, cPrev, cDevice] = await Promise.all([
    convBy('campaign', 'segments.date', cur, (r) => r.segments.date),
    convBy('campaign', 'campaign.id', cur, (r) => String(r.campaign.id)),
    convBy('campaign', '', before, () => 'all'),
    convBy('campaign', 'segments.device', cur, (r) => r.segments.device),
  ]);

  const [keywords, cKeyword, terms, cTerm] = await Promise.all([
    optional('palavras-chave', () => search(`SELECT ad_group_criterion.keyword.text, ${METRICS} FROM keyword_view WHERE ${cur} AND metrics.impressions > 0`), [] as any[]),
    optional('palavras-chave', () => convBy('keyword_view', 'ad_group_criterion.keyword.text', cur, (r) => r.adGroupCriterion?.keyword?.text ?? '—'), new Map<string, Conv>()),
    optional('termos', () => search(`SELECT search_term_view.search_term, ${METRICS} FROM search_term_view WHERE ${cur}`), [] as any[]),
    optional('termos', () => convBy('search_term_view', 'search_term_view.search_term', cur, (r) => r.searchTermView.searchTerm), new Map<string, Conv>()),
  ]);

  const dailyPoints: DailyPoint[] = [...group(daily, (r) => r.segments.date).entries()]
    .map(([date, b]) => ({ date, ...b, ...(cDaily.get(date) ?? NO_CONV) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const campaignRows: CampaignRow[] = campaigns
    .map((r) => ({
      id: String(r.campaign.id),
      name: r.campaign.name,
      type: CHANNEL[r.campaign.advertisingChannelType] ?? r.campaign.advertisingChannelType,
      ...toBase(r.metrics),
      ...(cCampaign.get(String(r.campaign.id)) ?? NO_CONV),
    }))
    .sort((a, b) => b.spend - a.spend);

  const sum = (rows: Totals[]): Totals =>
    rows.reduce(
      (a, r) => ({
        spend: a.spend + r.spend,
        impressions: a.impressions + r.impressions,
        clicks: a.clicks + r.clicks,
        pageviews: a.pageviews + r.pageviews,
        leads: a.leads + r.leads,
      }),
      { spend: 0, impressions: 0, clicks: 0, pageviews: 0, leads: 0 },
    );

  const prevBase = [...group(prevRows, () => 'all').values()][0] ?? { spend: 0, impressions: 0, clicks: 0 };

  const keywordRows: KeywordRow[] = [...group(keywords, (r) => r.adGroupCriterion?.keyword?.text ?? '—').entries()]
    .map(([keyword, b]) => ({ keyword, ...b, leads: cKeyword.get(keyword)?.leads ?? 0 }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 50);

  const termRows: SearchTermRow[] = [...group(terms, (r) => r.searchTermView?.searchTerm ?? '—').entries()]
    .map(([term, b]) => ({ term, ...b, leads: cTerm.get(term)?.leads ?? 0 }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 50);

  const deviceRows: BreakdownRow[] = [...group(device, (r) => r.segments.device).entries()]
    .map(([d, b]) => ({ name: DEVICE[d] ?? d, ...b, ...(cDevice.get(d) ?? NO_CONV) }))
    .filter((d) => d.impressions > 0)
    .sort((a, b) => b.clicks - a.clicks);

  return {
    // Total a partir da série diária (inclui campanhas pausadas que rodaram no período)
    totals: sum(dailyPoints),
    prev: { ...prevBase, ...(cPrev.get('all') ?? NO_CONV) },
    daily: dailyPoints,
    campaigns: campaignRows,
    keywords: keywordRows,
    device: deviceRows,
    terms: termRows,
    leadActions: leadActions(),
    pageviewActions: pageviewActions(),
  };
}
