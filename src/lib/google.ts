import type { DateRange, GoogleCampaignRow, GoogleData, GoogleGroup, GoogleTotals, SearchTermRow, VideoRow } from './types';
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
const between = (r: DateRange) => `segments.date BETWEEN '${r.start}' AND '${r.end}'`;

/** Só as campanhas dos leilões dos Correios (trecho do nome, sem diferenciar maiúsculas). */
function onlyFiltered(): string {
  const f = campaignFilter().replace(/[^a-z0-9 _-]/g, '');
  return `campaign.name REGEXP_MATCH '(?i).*${f}.*'`;
}

/** Ações de conversão contadas como lead (cadastro, formulário): nomes exatos, separados por vírgula. */
const leadActions = () =>
  (process.env.GOOGLE_ADS_LEAD_ACTIONS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const CHANNEL: Record<string, string> = {
  SEARCH: 'Pesquisa',
  SHOPPING: 'Shopping',
  PERFORMANCE_MAX: 'Performance Max',
  DISPLAY: 'Display',
  VIDEO: 'Vídeo',
  DEMAND_GEN: 'Demand Gen',
};

/** Campanhas que rodam no YouTube: vão para a página "YouTube" e saem da página "Google Ads". */
const isYouTube = (channel: string) => channel === 'VIDEO' || channel === 'DEMAND_GEN';

type CampaignRow = GoogleCampaignRow & { channel: string };

/** Campanhas com entrega no período, já com os leads das ações configuradas. */
async function campaigns(range: DateRange): Promise<CampaignRow[]> {
  const where = `${between(range)} AND ${onlyFiltered()}`;
  const wanted = new Set(leadActions().map((s) => s.toLowerCase()));

  const [rows, conv] = await Promise.all([
    search(
      `SELECT campaign.id, campaign.name, campaign.advertising_channel_type, metrics.impressions, metrics.clicks, metrics.video_trueview_views, metrics.search_top_impression_share FROM campaign WHERE ${where} AND metrics.impressions > 0`,
    ),
    // "Todas as conversões": nas campanhas de tráfego essas ações não entram na coluna "conversões"
    wanted.size ? search(`SELECT campaign.id, segments.conversion_action_name, metrics.all_conversions FROM campaign WHERE ${where}`) : Promise.resolve([]),
  ]);

  const leads = new Map<string, number>();
  for (const r of conv) {
    if (!wanted.has(String(r.segments?.conversionActionName ?? '').toLowerCase())) continue;
    const id = String(r.campaign.id);
    leads.set(id, (leads.get(id) ?? 0) + num(r.metrics?.allConversions));
  }

  return rows.map((r) => {
    const id = String(r.campaign.id);
    const channel = String(r.campaign.advertisingChannelType ?? '');
    return {
      id,
      name: r.campaign.name,
      type: CHANNEL[channel] ?? channel,
      channel,
      impressions: num(r.metrics?.impressions),
      clicks: num(r.metrics?.clicks),
      views: num(r.metrics?.videoTrueviewViews),
      leads: leads.get(id) ?? 0,
      // Só existe na rede de pesquisa. O Google devolve 0.0999 para "menos de 10%".
      topShare: channel === 'SEARCH' && r.metrics?.searchTopImpressionShare != null ? num(r.metrics.searchTopImpressionShare) : undefined,
    };
  });
}

function sum(rows: CampaignRow[]): GoogleTotals {
  const t = rows.reduce(
    (a, r) => ({ impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks, leads: a.leads + r.leads, views: a.views + r.views }),
    { impressions: 0, clicks: 0, leads: 0, views: 0 },
  );
  // Parcela de impressões não se soma: com mais de uma campanha de pesquisa, usa a média ponderada pelas impressões
  const search = rows.filter((r) => r.topShare !== undefined && r.impressions > 0);
  const weight = search.reduce((s, r) => s + r.impressions, 0);
  return { ...t, topShare: weight ? search.reduce((s, r) => s + r.topShare! * r.impressions, 0) / weight : undefined };
}

/** Visões extras: se uma delas falhar, o restante da página continua. */
async function optional<T>(what: string, fn: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error(`Google Ads (${what}): ${e instanceof Error ? e.message : String(e)}`);
    return empty;
  }
}

/** Termos de pesquisa das campanhas, somados por termo. */
async function searchTerms(range: DateRange): Promise<SearchTermRow[]> {
  const rows = await search(
    `SELECT search_term_view.search_term, metrics.impressions, metrics.clicks FROM search_term_view WHERE ${between(range)} AND ${onlyFiltered()} AND metrics.impressions > 0`,
  );
  const map = new Map<string, SearchTermRow>();
  for (const r of rows) {
    const term = r.searchTermView?.searchTerm ?? '—';
    const e = map.get(term) ?? { term, impressions: 0, clicks: 0 };
    e.impressions += num(r.metrics?.impressions);
    e.clicks += num(r.metrics?.clicks);
    map.set(term, e);
  }
  return [...map.values()].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 100);
}

/** Vídeos anunciados nas campanhas, somados por vídeo. */
async function videos(range: DateRange): Promise<VideoRow[]> {
  const rows = await search(
    `SELECT video.id, video.title, campaign.name, metrics.impressions, metrics.clicks, metrics.video_trueview_views FROM video WHERE ${between(range)} AND ${onlyFiltered()}`,
  );
  const map = new Map<string, VideoRow>();
  for (const r of rows) {
    const id = String(r.video?.id ?? '');
    if (!id) continue;
    const e = map.get(id) ?? { id, title: r.video?.title || id, views: 0, impressions: 0, clicks: 0 };
    e.views += num(r.metrics?.videoTrueviewViews);
    e.impressions += num(r.metrics?.impressions);
    e.clicks += num(r.metrics?.clicks);
    map.set(id, e);
  }
  return [...map.values()].filter((v) => v.impressions > 0).sort((a, b) => b.views - a.views);
}

function group(cur: CampaignRow[], prev: CampaignRow[], youtube: boolean): GoogleGroup {
  const mine = (r: CampaignRow) => isYouTube(r.channel) === youtube;
  return {
    totals: sum(cur.filter(mine)),
    prev: sum(prev.filter(mine)),
    campaigns: cur
      .filter(mine)
      .map(({ channel: _channel, ...row }) => row)
      .sort((a, b) => b.impressions - a.impressions),
  };
}

export async function fetchGoogle(range: DateRange): Promise<GoogleData> {
  const [cur, prev, terms, vids] = await Promise.all([
    campaigns(range),
    campaigns(previousRange(range)),
    optional('termos de pesquisa', () => searchTerms(range), [] as SearchTermRow[]),
    optional('vídeos', () => videos(range), [] as VideoRow[]),
  ]);
  return { ads: group(cur, prev, false), youtube: group(cur, prev, true), terms, videos: vids };
}
