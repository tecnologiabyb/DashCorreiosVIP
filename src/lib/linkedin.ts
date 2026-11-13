import type { CampaignRow, DailyPoint, DateRange, LinkedInData, LinkedInTotals } from './types';
import { previousRange } from './dates';
import { matchesFilter } from './filter';

// LinkedIn Marketing API (versionada). Precisa de um token com o escopo r_ads_reporting (e r_ads para listar campanhas).
const API = 'https://api.linkedin.com/rest';

function config() {
  const account = process.env.LINKEDIN_AD_ACCOUNT_ID?.replace(/\D/g, '');
  if (!account) throw new Error('LinkedIn: LINKEDIN_AD_ACCOUNT_ID não configurado');
  return { account, version: process.env.LINKEDIN_API_VERSION || '202601' };
}

// O access token do LinkedIn vale ~60 dias; o refresh token, 12 meses. Com LINKEDIN_REFRESH_TOKEN,
// LINKEDIN_CLIENT_ID e LINKEDIN_CLIENT_SECRET a dash gera um access token novo sozinha e o guarda em memória.
let cachedToken: { value: string; exp: number } | null = null;

function canRefresh(): boolean {
  const { LINKEDIN_REFRESH_TOKEN, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET } = process.env;
  return !!(LINKEDIN_REFRESH_TOKEN && LINKEDIN_CLIENT_ID && LINKEDIN_CLIENT_SECRET);
}

async function refreshToken(): Promise<string> {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.LINKEDIN_REFRESH_TOKEN!,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!json.access_token) throw new Error(`LinkedIn: não foi possível renovar o token (${json.error_description || json.error || res.status})`);
  // Renova um dia antes de vencer
  cachedToken = { value: json.access_token, exp: Date.now() + (Number(json.expires_in || 3600) - 86_400) * 1000 };
  return json.access_token;
}

/**
 * Token em uso: o renovado em memória, depois o LINKEDIN_ACCESS_TOKEN fixo; sem nenhum dos dois, renova.
 * `force` descarta os dois e renova (usado quando a API responde 401).
 */
async function accessToken(force = false): Promise<string> {
  if (!force && cachedToken && cachedToken.exp > Date.now()) return cachedToken.value;
  const fixed = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!force && fixed && !cachedToken) return fixed;
  if (canRefresh()) return refreshToken();
  if (fixed && !force) return fixed;
  throw new Error(
    fixed
      ? 'LinkedIn: o token expirou. Gere outro ou configure LINKEDIN_REFRESH_TOKEN, LINKEDIN_CLIENT_ID e LINKEDIN_CLIENT_SECRET'
      : 'LinkedIn: LINKEDIN_ACCESS_TOKEN não configurado',
  );
}

async function get(pathAndQuery: string): Promise<any> {
  const { version } = config();
  const call = async (token: string) =>
    fetch(`${API}/${pathAndQuery}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'LinkedIn-Version': version,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      cache: 'no-store',
    });
  let res = await call(await accessToken());
  // Token vencido ou revogado: renova uma vez e repete a chamada
  if (res.status === 401) res = await call(await accessToken(true));
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`LinkedIn: ${json.message || json.error_description || `erro ${res.status}`}`);
  return json;
}

const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;

/** A sintaxe Rest.li usa parênteses e dois-pontos literais: a consulta é montada à mão. */
function dateParam(r: DateRange): string {
  const p = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return `(year:${y},month:${m},day:${d})`;
  };
  return `(start:${p(r.start)},end:${p(r.end)})`;
}

const FIELDS = 'dateRange,pivotValues,impressions,clicks,landingPageClicks,costInLocalCurrency,oneClickLeads,externalWebsiteConversions';

async function analytics(range: DateRange, granularity: 'DAILY' | 'ALL'): Promise<any[]> {
  const { account } = config();
  const accounts = `List(${encodeURIComponent(`urn:li:sponsoredAccount:${account}`)})`;
  const json = await get(
    `adAnalytics?q=analytics&pivot=CAMPAIGN&timeGranularity=${granularity}&dateRange=${dateParam(range)}&accounts=${accounts}&fields=${FIELDS}`,
  );
  return json.elements ?? [];
}

/** Nome e formato de cada campanha da conta (id → dados). */
async function campaignNames(): Promise<Map<string, { name: string; type?: string }>> {
  const { account } = config();
  const map = new Map<string, { name: string; type?: string }>();
  let token: string | undefined;
  for (let i = 0; i < 20; i++) {
    const json = await get(`adAccounts/${account}/adCampaigns?q=search&pageSize=500${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`);
    for (const c of json.elements ?? []) map.set(String(c.id), { name: c.name, type: FORMAT[c.format] ?? c.format });
    token = json.metadata?.nextPageToken;
    if (!token) break;
  }
  return map;
}

const FORMAT: Record<string, string> = {
  SINGLE_IMAGE: 'Imagem',
  STANDARD_UPDATE: 'Imagem',
  CAROUSEL: 'Carrossel',
  SINGLE_VIDEO: 'Vídeo',
  TEXT_AD: 'Texto',
  SPONSORED_INMAIL: 'Mensagem',
  SPONSORED_MESSAGE: 'Conversa',
  FOLLOW_COMPANY: 'Seguidores',
};

function toTotals(r: any): LinkedInTotals {
  const form = num(r?.oneClickLeads);
  const site = num(r?.externalWebsiteConversions);
  return {
    spend: num(r?.costInLocalCurrency),
    impressions: num(r?.impressions),
    clicks: num(r?.clicks),
    // O LinkedIn não informa visualização de página: usa os cliques que levaram à página de destino
    pageviews: num(r?.landingPageClicks),
    leads: form + site,
    leadsForm: form,
    leadsSite: site,
  };
}

const ZERO: LinkedInTotals = { spend: 0, impressions: 0, clicks: 0, pageviews: 0, leads: 0, leadsForm: 0, leadsSite: 0 };

function add(a: LinkedInTotals, b: LinkedInTotals): LinkedInTotals {
  return {
    spend: a.spend + b.spend,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    pageviews: a.pageviews + b.pageviews,
    leads: a.leads + b.leads,
    leadsForm: a.leadsForm + b.leadsForm,
    leadsSite: a.leadsSite + b.leadsSite,
  };
}

/** "urn:li:sponsoredCampaign:123" → "123" */
const campaignId = (r: any) => String(r?.pivotValues?.[0] ?? '').split(':').pop() ?? '';

const isoOf = (d: any) => `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

export async function fetchLinkedIn(range: DateRange): Promise<LinkedInData> {
  const prev = previousRange(range);
  const [names, daily, before] = await Promise.all([campaignNames(), analytics(range, 'DAILY'), analytics(prev, 'ALL')]);

  // Só as campanhas dos leilões dos Correios
  const keep = (r: any) => matchesFilter(names.get(campaignId(r))?.name);

  const byDay = new Map<string, LinkedInTotals>();
  const byCampaign = new Map<string, LinkedInTotals>();
  for (const r of daily.filter(keep)) {
    const t = toTotals(r);
    const date = isoOf(r.dateRange.start);
    byDay.set(date, add(byDay.get(date) ?? ZERO, t));
    const id = campaignId(r);
    byCampaign.set(id, add(byCampaign.get(id) ?? ZERO, t));
  }

  const dailyPoints: DailyPoint[] = [...byDay.entries()].map(([date, t]) => ({ date, ...t })).sort((a, b) => a.date.localeCompare(b.date));

  const campaigns: CampaignRow[] = [...byCampaign.entries()]
    .map(([id, t]) => ({ id, name: names.get(id)?.name ?? id, type: names.get(id)?.type, ...t }))
    .sort((a, b) => b.spend - a.spend);

  return {
    totals: [...byCampaign.values()].reduce(add, ZERO),
    prev: before.filter(keep).map(toTotals).reduce(add, ZERO),
    daily: dailyPoints,
    campaigns,
  };
}
