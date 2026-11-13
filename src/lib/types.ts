export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;
}

/** Métricas comuns às três plataformas. O foco da dash é `pageviews` e `leads`. */
export interface Totals {
  spend: number;
  impressions: number;
  clicks: number;
  /** Visualizações da página de destino (Meta: landing page view; Google: ação de pageview; LinkedIn: cliques para a página). */
  pageviews: number;
  leads: number;
}

export interface DailyPoint extends Totals {
  date: string;
}

export interface CampaignRow extends Totals {
  id?: string;
  name: string;
  /** Tipo (Google: Pesquisa, Display...; Meta: objetivo; LinkedIn: formato). */
  type?: string;
}

export interface BreakdownRow {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  pageviews: number;
  leads: number;
}

export interface MetaTotals extends Totals {
  reach: number;
  /** Leads de formulário instantâneo (dentro do Facebook/Instagram). */
  leadsForm: number;
  /** Leads registrados pelo pixel no site. */
  leadsSite: number;
}

export interface AdRow extends Totals {
  id: string;
  name: string;
  campaignId?: string;
  thumbnail?: string;
}

export interface MetaData {
  totals: MetaTotals;
  prev: MetaTotals;
  daily: DailyPoint[];
  campaigns: CampaignRow[];
  /** Todos os anúncios do período, do melhor para o pior (filtrar por campaignId). */
  ads: AdRow[];
  age: BreakdownRow[];
  gender: BreakdownRow[];
  region: BreakdownRow[];
}

export interface KeywordRow {
  keyword: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
}

export interface SearchTermRow {
  term: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
}

export interface GoogleData {
  totals: Totals;
  prev: Totals;
  daily: DailyPoint[];
  campaigns: CampaignRow[];
  keywords: KeywordRow[];
  device: BreakdownRow[];
  terms: SearchTermRow[];
  /** Ações de conversão contadas como lead e como pageview (nomes configurados). */
  leadActions: string[];
  pageviewActions: string[];
}

export interface LinkedInTotals extends Totals {
  /** Leads de formulário nativo (Lead Gen Form). */
  leadsForm: number;
  /** Conversões registradas no site pela Insight Tag. */
  leadsSite: number;
}

export interface LinkedInData {
  totals: LinkedInTotals;
  prev: LinkedInTotals;
  daily: DailyPoint[];
  campaigns: CampaignRow[];
}

export interface SourceResult<T> {
  data: T;
  mock: boolean;
  error?: string;
}

export interface DashboardResponse {
  range: DateRange;
  prevRange: DateRange;
  /** Trecho do nome que seleciona as campanhas (ex.: "correios"). */
  filter: string;
  meta: SourceResult<MetaData>;
  google: SourceResult<GoogleData>;
  /** LinkedIn Ads. `data` é null quando o token não está configurado ou a API falhou. */
  linkedin: { data: LinkedInData | null; error?: string };
  updatedAt: string;
}
