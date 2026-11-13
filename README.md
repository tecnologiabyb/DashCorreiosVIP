# Dash Leilões Correios

Dashboard de **leads e pageviews** das campanhas dos leilões dos Correios (Vip Leilões) em Meta Ads, Google Ads e LinkedIn Ads. Mesma base da Dash Haskell (Next.js, deploy na Vercel).

## Rodar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:3000 e entre com a senha `ADMIN_PASSWORD` do `.env.local`.

## Quais campanhas entram

Só as campanhas com `CAMPAIGN_FILTER` no nome (padrão: `correios`), nas três plataformas.

| Plataforma | Conta |
| --- | --- |
| Meta Ads | `1059526002159277` (Vip Leilões) |
| Google Ads | `3657362033` (Vip Leilões Automóveis), via MCC BYB `6363710958` |
| LinkedIn Ads | `515257058` (VIP Leilões), pelo app "Dash Correios BYB" |

## De onde vem cada métrica

| | Leads | Pageviews |
| --- | --- | --- |
| Meta | ação `lead` (formulário instantâneo + pixel no site), com a divisão entre os dois | visualizações da página de destino (`landing_page_view`) |
| Google | "todas as conversões" das ações em `GOOGLE_ADS_LEAD_ACTIONS` | "todas as conversões" das ações em `GOOGLE_ADS_PAGEVIEW_ACTIONS` |
| LinkedIn | formulários nativos (`oneClickLeads`) + conversões no site (`externalWebsiteConversions`) | cliques para a página de destino (`landingPageClicks`): o LinkedIn não informa visualização de página |

No Google usamos "todas as conversões" porque as campanhas de tráfego não contam essas ações na coluna "conversões".

## Páginas

- **Visão geral**: leads, custo por lead, pageviews, custo por pageview, investimento e cliques somados; leads e pageviews por dia; resultado por plataforma; campanhas de todas as plataformas.
- **Meta Ads**: funil, leads de formulário x site, idade, gênero, estado, melhores anúncios e campanhas (clique numa campanha para ver os anúncios).
- **Google Ads**: funil, palavras-chave, termos de pesquisa, dispositivo e campanhas.
- **LinkedIn Ads**: funil e campanhas. Sem `LINKEDIN_ACCESS_TOKEN` e `LINKEDIN_AD_ACCOUNT_ID` a aba mostra um aviso e a visão geral soma só Meta + Google.

### Token do LinkedIn

O access token do LinkedIn vale cerca de 60 dias. Com `LINKEDIN_REFRESH_TOKEN`, `LINKEDIN_CLIENT_ID` e `LINKEDIN_CLIENT_SECRET` preenchidos, a dash gera um access token novo sozinha quando o atual vence (ou quando a API responde 401). O refresh token vale 12 meses a partir da autorização (13/11/2026): antes de 13/11/2027 é preciso gerar outro em `linkedin.com/developers/tools/oauth/token-generator`, com os escopos `r_ads` e `r_ads_reporting`, e atualizar `LINKEDIN_REFRESH_TOKEN`.

Enquanto o token da Meta ou do Google não estiver válido, a dash mostra **dados de exemplo** nessa plataforma e um aviso no topo com o erro.

Todas as variações comparam com o período anterior de mesma duração.

## Deploy (Vercel)

1. Suba o repositório no GitHub e importe na Vercel.
2. Cadastre as variáveis do `.env.example` em Settings → Environment Variables.
