import type { DateRange, LinkedInData, Row, Totals } from './types';
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

const FIELDS = 'pivotValues,impressions,clicks,oneClickLeads,externalWebsiteConversions';

/** Totais do período por campanha. */
async function analytics(range: DateRange): Promise<any[]> {
  const { account } = config();
  const accounts = `List(${encodeURIComponent(`urn:li:sponsoredAccount:${account}`)})`;
  const json = await get(`adAnalytics?q=analytics&pivot=CAMPAIGN&timeGranularity=ALL&dateRange=${dateParam(range)}&accounts=${accounts}&fields=${FIELDS}`);
  return json.elements ?? [];
}

/** Nome de cada campanha da conta (id → nome). */
async function campaignNames(): Promise<Map<string, string>> {
  const { account } = config();
  const map = new Map<string, string>();
  let token: string | undefined;
  for (let i = 0; i < 20; i++) {
    const json = await get(`adAccounts/${account}/adCampaigns?q=search&pageSize=500${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`);
    for (const c of json.elements ?? []) map.set(String(c.id), c.name);
    token = json.metadata?.nextPageToken;
    if (!token) break;
  }
  return map;
}

/** Leads = formulários nativos (Lead Gen Form) + conversões registradas no site pela Insight Tag. */
const toTotals = (r: any): Totals => ({
  impressions: num(r?.impressions),
  clicks: num(r?.clicks),
  leads: num(r?.oneClickLeads) + num(r?.externalWebsiteConversions),
});

const add = (a: Totals, b: Totals): Totals => ({ impressions: a.impressions + b.impressions, clicks: a.clicks + b.clicks, leads: a.leads + b.leads });
const ZERO: Totals = { impressions: 0, clicks: 0, leads: 0 };

/** "urn:li:sponsoredCampaign:123" → "123" */
const campaignId = (r: any) => String(r?.pivotValues?.[0] ?? '').split(':').pop() ?? '';

export async function fetchLinkedIn(range: DateRange): Promise<LinkedInData> {
  const [names, cur, before] = await Promise.all([campaignNames(), analytics(range), analytics(previousRange(range))]);

  // Só as campanhas dos leilões dos Correios
  const keep = (r: any) => matchesFilter(names.get(campaignId(r)));

  const campaigns: Row[] = cur
    .filter(keep)
    .map((r) => ({ id: campaignId(r), name: names.get(campaignId(r)) ?? campaignId(r), ...toTotals(r) }))
    .filter((r) => r.impressions > 0 || r.clicks > 0 || r.leads > 0)
    .sort((a, b) => b.impressions - a.impressions);

  return {
    totals: campaigns.reduce<Totals>(add, ZERO),
    prev: before.filter(keep).map(toTotals).reduce(add, ZERO),
    campaigns,
  };
}
