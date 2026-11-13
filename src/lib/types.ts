export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;
}

/** Métricas do Cockpit de Growth Correios (o relatório de referência não mostra investimento). */
export interface Totals {
  impressions: number;
  clicks: number;
  leads: number;
}

export interface Row extends Totals {
  id?: string;
  name: string;
}

export interface MetaTotals extends Totals {
  /** Cliques no link dos conjuntos de leads: base da taxa de conversão (leads ÷ cliques no link). */
  leadLinkClicks: number;
}

export interface MetaAdsetRow extends Row {
  /** Visualizações da página de destino. */
  pageviews: number;
}

export interface MetaData {
  totals: MetaTotals;
  prev: MetaTotals;
  /** Conjuntos das campanhas com objetivo de leads. */
  leadAdsets: MetaAdsetRow[];
  /** Conjuntos das campanhas de tráfego (pageview). */
  trafficAdsets: MetaAdsetRow[];
}

export interface GoogleCampaignRow extends Row {
  /** Tipo da campanha (Pesquisa, Display, Demand Gen...). */
  type?: string;
  /** Visualizações de vídeo (YouTube). */
  views: number;
  /** Parcela de impressões na parte superior da pesquisa (0 a 1). Ausente fora da rede de pesquisa. */
  topShare?: number;
}

export type GoogleTotals = Totals & { views: number; topShare?: number };

export interface GoogleGroup {
  totals: GoogleTotals;
  prev: GoogleTotals;
  campaigns: GoogleCampaignRow[];
}

export interface SearchTermRow {
  term: string;
  impressions: number;
  clicks: number;
}

export interface VideoRow {
  /** ID do vídeo no YouTube (a miniatura vem de i.ytimg.com). */
  id: string;
  title: string;
  views: number;
  impressions: number;
  clicks: number;
}

export interface GoogleData {
  /** Campanhas de Pesquisa, Display e Performance Max. */
  ads: GoogleGroup;
  /** Campanhas de Vídeo e Demand Gen. */
  youtube: GoogleGroup;
  /** Termos de pesquisa das campanhas, dos mais clicados para os menos. */
  terms: SearchTermRow[];
  /** Vídeos anunciados, dos mais vistos para os menos. */
  videos: VideoRow[];
}

export interface LinkedInData {
  totals: Totals;
  prev: Totals;
  /** No LinkedIn o "grupo de anúncio" do relatório é a campanha. */
  campaigns: Row[];
}

/** `data` é null quando a fonte não está configurada ou a API falhou. */
export interface Source<T> {
  data: T | null;
  error?: string;
}

export interface DashboardResponse {
  range: DateRange;
  prevRange: DateRange;
  /** Trecho do nome que seleciona as campanhas (ex.: "correios"). */
  filter: string;
  meta: Source<MetaData>;
  google: Source<GoogleData>;
  linkedin: Source<LinkedInData>;
  updatedAt: string;
}
