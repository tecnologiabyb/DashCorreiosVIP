// Dados de exemplo usados enquanto as credenciais reais não estão configuradas.
import type { DateRange, GoogleData, MetaData, MetaTotals, Totals } from './types';
import { eachDay } from './dates';

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function day(date: string, base: number, salt: string): Totals {
  const r = rng(date + salt);
  const spend = base * (0.7 + r() * 0.6);
  const impressions = Math.round(spend * (120 + r() * 60));
  const clicks = Math.round(impressions * (0.012 + r() * 0.01));
  const pageviews = Math.round(clicks * (0.6 + r() * 0.2));
  const leads = Math.round(clicks * (0.04 + r() * 0.04));
  return { spend, impressions, clicks, pageviews, leads };
}

function add(a: Totals, b: Totals): Totals {
  return {
    spend: a.spend + b.spend,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    pageviews: a.pageviews + b.pageviews,
    leads: a.leads + b.leads,
  };
}
const zero: Totals = { spend: 0, impressions: 0, clicks: 0, pageviews: 0, leads: 0 };

function metaTotals(t: Totals): MetaTotals {
  const leadsForm = Math.round(t.leads * 0.6);
  return { ...t, reach: Math.round(t.impressions * 0.52), leadsForm, leadsSite: t.leads - leadsForm };
}

function split<T extends string>(names: T[], total: Totals, seed: string) {
  const r = rng(seed);
  const w = names.map(() => 0.3 + r());
  const s = w.reduce((a, b) => a + b, 0);
  return names.map((name, i) => ({
    name,
    spend: (total.spend * w[i]) / s,
    impressions: Math.round((total.impressions * w[i]) / s),
    clicks: Math.round((total.clicks * w[i]) / s),
    pageviews: Math.round((total.pageviews * w[i]) / s),
    leads: Math.round((total.leads * w[i]) / s),
  }));
}

export function mockMeta(range: DateRange, prev: DateRange): MetaData {
  const daily = eachDay(range).map((d) => ({ date: d, ...day(d, 400, 'meta') }));
  const totals = daily.reduce<Totals>(add, zero);
  const prevTotals = eachDay(prev).map((d) => day(d, 350, 'meta')).reduce(add, zero);
  const campaigns = split(['[EXEMPLO] leads-correios', '[EXEMPLO] trafego-correios'], totals, 'camp')
    .map((c, i) => ({ ...c, id: `camp${i}`, type: i === 0 ? 'Leads' : 'Tráfego' }))
    .sort((a, b) => b.spend - a.spend);
  const ads = split(['Lote a lote — veículos', 'Lote a lote — motos', 'Vídeo institucional', 'Carrossel lotes'], totals, 'ads')
    .map((a, i) => ({ ...a, id: String(i), campaignId: `camp${i % 2}` }))
    .sort((a, b) => b.leads - a.leads);
  return {
    totals: metaTotals(totals),
    prev: metaTotals(prevTotals),
    daily,
    campaigns,
    ads,
    age: split(['18-24', '25-34', '35-44', '45-54', '55-64', '65+'], totals, 'age'),
    gender: split(['Feminino', 'Masculino', 'Não informado'], totals, 'gender'),
    region: split(['São Paulo', 'Minas Gerais', 'Rio de Janeiro', 'Bahia', 'Paraná', 'Rio Grande do Sul', 'Pernambuco', 'Goiás'], totals, 'region').sort(
      (a, b) => b.impressions - a.impressions,
    ),
  };
}

export function mockGoogle(range: DateRange, prev: DateRange): GoogleData {
  const daily = eachDay(range).map((d) => ({ date: d, ...day(d, 120, 'google') }));
  const totals = daily.reduce<Totals>(add, zero);
  const prevTotals = eachDay(prev).map((d) => day(d, 110, 'google')).reduce(add, zero);
  const kw = ['leilão correios', 'leilão dos correios veículos', 'leilão correios motos', 'leilão de carros correios', 'vip leilões correios'];
  const rows = split(kw, totals, 'kw').sort((a, b) => b.clicks - a.clicks);
  return {
    totals,
    prev: prevTotals,
    daily,
    campaigns: split(['[EXEMPLO] pesquisa-correios'], totals, 'gcamp').map((c) => ({ ...c, id: 'g0', type: 'Pesquisa' })),
    keywords: rows.map((k) => ({ keyword: k.name, spend: k.spend, impressions: k.impressions, clicks: k.clicks, leads: k.leads })),
    device: split(['Celular', 'Computador', 'Tablet'], totals, 'dev'),
    terms: rows.map((k) => ({ term: k.name, spend: k.spend, impressions: k.impressions, clicks: k.clicks, leads: k.leads })),
    leadActions: [],
    pageviewActions: [],
  };
}
