import type { DateRange, MetaAdsetRow, MetaData, MetaTotals } from './types';
import { campaignFilter } from './filter';

const API = 'https://graph.facebook.com/v21.0';

type Action = { action_type: string; value: string };

const LANDING = ['landing_page_view', 'omni_landing_page_view'];
// `lead` é o total que o Gerenciador mostra (formulário instantâneo + pixel no site).
// Sem ele, soma os dois tipos.
const LEAD_PARTS = ['onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];

const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
const action = (list: Action[] | undefined, type: string) => num(list?.find((x) => x.action_type === type)?.value);

function pick(list: Action[] | undefined, types: string[]): number {
  for (const t of types) {
    const v = action(list, t);
    if (v) return v;
  }
  return 0;
}

const leadsOf = (list: Action[] | undefined) => action(list, 'lead') || LEAD_PARTS.reduce((s, t) => s + action(list, t), 0);

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

/** Campanha com objetivo de geração de leads (as demais são tratadas como tráfego). */
const isLeadCampaign = (objective: string | undefined) => /LEAD/i.test(objective ?? '');

// "Cliques" segue o relatório de referência: todos os cliques do anúncio, não só os cliques no link.
const FIELDS = 'impressions,clicks,inline_link_clicks,actions';

function totals(rows: any[]): MetaTotals {
  const t: MetaTotals = { impressions: 0, clicks: 0, leads: 0, leadLinkClicks: 0 };
  for (const r of rows) {
    t.impressions += num(r.impressions);
    t.clicks += num(r.clicks);
    t.leads += leadsOf(r.actions);
    if (isLeadCampaign(r.objective)) t.leadLinkClicks += num(r.inline_link_clicks);
  }
  return t;
}

export async function fetchMeta(range: DateRange): Promise<MetaData> {
  const token = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) throw new Error('Meta: META_ACCESS_TOKEN ou META_AD_ACCOUNT_ID não configurado');
  const act = account.startsWith('act_') ? account : `act_${account}`;
  const tr = (r: DateRange) => JSON.stringify({ since: r.start, until: r.end });
  // Só as campanhas dos leilões dos Correios (trecho do nome, sem diferenciar maiúsculas)
  const filtering = JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: campaignFilter() }]);
  const insights = (p: Record<string, string>) => get(`${act}/insights`, { limit: '500', filtering, ...p }, token);

  const [campaigns, adsets] = await Promise.all([
    insights({ time_range: tr(range), level: 'campaign', fields: `campaign_id,objective,${FIELDS}` }),
    insights({ time_range: tr(range), level: 'adset', fields: `adset_id,adset_name,campaign_id,${FIELDS}` }),
  ]);

  const leadCampaigns = new Set(campaigns.filter((c) => isLeadCampaign(c.objective)).map((c) => c.campaign_id));

  const rows = adsets.map((r) => ({
    campaignId: r.campaign_id as string,
    row: {
      id: r.adset_id,
      name: r.adset_name,
      impressions: num(r.impressions),
      clicks: num(r.clicks),
      leads: leadsOf(r.actions),
      pageviews: pick(r.actions, LANDING),
    } satisfies MetaAdsetRow,
  }));

  return {
    totals: totals(campaigns),
    leadAdsets: rows.filter((r) => leadCampaigns.has(r.campaignId)).map((r) => r.row).sort((a, b) => b.leads - a.leads),
    trafficAdsets: rows.filter((r) => !leadCampaigns.has(r.campaignId)).map((r) => r.row).sort((a, b) => b.pageviews - a.pageviews),
  };
}
