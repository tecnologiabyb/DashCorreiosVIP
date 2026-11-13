# Dash Leilões Correios

Dashboard das campanhas dos leilões dos Correios (Vip Leilões) em Meta Ads, Google Ads e LinkedIn Ads. Mesma base da Dash Haskell (Next.js, deploy na Vercel).

## Rodar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:3000. A dash não tem tela de login: quem tiver o endereço vê os dados.

## Quais campanhas entram

Só as campanhas com `CAMPAIGN_FILTER` no nome (padrão: `correios`), nas três plataformas.

| Plataforma | Conta |
| --- | --- |
| Meta Ads | `1059526002159277` (Vip Leilões) |
| Google Ads | `3657362033` (Vip Leilões Automóveis), via MCC BYB `6363710958` |
| LinkedIn Ads | `515257058` (VIP Leilões), pelo app "Dash Correios BYB" |

## De onde vem cada métrica

A dash espelha o relatório "Cockpit de Growth Correios - Vip Leilões" do Data Studio: mesmas páginas, mesmos indicadores e mesmas tabelas. Como no relatório, não mostra investimento.

| | Cliques | Leads | Outros |
| --- | --- | --- | --- |
| Meta | todos os cliques do anúncio | ação `lead` (formulário instantâneo + pixel no site) | Visualização de página de destino = `landing_page_view`. Taxa de conversão = leads ÷ cliques no link das campanhas de leads |
| Google | cliques | "todas as conversões" das ações em `GOOGLE_ADS_LEAD_ACTIONS` | campanhas de Pesquisa, Display e Performance Max |
| YouTube | cliques | - | campanhas de Vídeo e Demand Gen; visualizações = `video_trueview_views` |
| LinkedIn | cliques | formulários nativos (`oneClickLeads`) + conversões no site (`externalWebsiteConversions`) | o "grupo de anúncio" do relatório é a campanha do LinkedIn |

No Google usamos "todas as conversões" porque as campanhas de tráfego não contam essas ações na coluna "conversões".

## Páginas

- **Google Ads**: impressões, CTR, % Share Top (parcela de impressões na parte superior da pesquisa, `search_top_impression_share`) e cliques; os mesmos dados por campanha.
- **YouTube**: impressões, cliques e CTR; vídeos com miniatura, título e visualizações.
- **Meta Ads**: impressões, cliques, leads e taxa de conversão; visão de leads por conjunto de anúncio e visão de tráfego por conjunto de anúncio.
- **LinkedIn Ads**: impressões, cliques e CTR; visão por grupo de anúncio.

O período padrão é o mês atual. Se uma plataforma falhar, a página dela mostra o erro e as outras seguem funcionando.

### Token do LinkedIn

O access token do LinkedIn vale cerca de 60 dias. Com `LINKEDIN_REFRESH_TOKEN`, `LINKEDIN_CLIENT_ID` e `LINKEDIN_CLIENT_SECRET` preenchidos, a dash gera um access token novo sozinha quando o atual vence (ou quando a API responde 401). O refresh token vale 12 meses a partir da autorização (13/11/2026): antes de 13/11/2027 é preciso gerar outro em `linkedin.com/developers/tools/oauth/token-generator`, com os escopos `r_ads` e `r_ads_reporting`, e atualizar `LINKEDIN_REFRESH_TOKEN`.



## Deploy (Vercel)

1. Suba o repositório no GitHub e importe na Vercel.
2. Cadastre as variáveis do `.env.example` em Settings → Environment Variables.
