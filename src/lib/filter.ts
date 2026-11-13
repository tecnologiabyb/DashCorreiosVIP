/** Trecho do nome que identifica as campanhas dos leilões dos Correios nas três plataformas. */
export function campaignFilter(): string {
  return (process.env.CAMPAIGN_FILTER ?? 'correios').trim().toLowerCase();
}

export const matchesFilter = (name: string | undefined) => (name ?? '').toLowerCase().includes(campaignFilter());
