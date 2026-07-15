## KPIs para abas Canais e Mensageria

Adicionar 4 KPIs no topo de cada aba usando o mesmo padrão visual da aba IA (`KpiCard` em grid `grid-cols-2 lg:grid-cols-4`, com ícone, label, value, sub e tone).

### Aba Canais (7 canais sociais)

Fonte de dados: `data?.channels` já retornado por `getConnections` (mesmo objeto usado pelos `ChannelCard`), filtrando pelos IDs sociais (`instagram`, `tiktok`, `facebook`, `youtube`, `linkedin`, `twitter`, `threads`).

1. **Canais conectados** — `X / 7` · tone emerald se ≥ 4, amber se 1–3, rose se 0. Ícone `Radio`.
2. **Cobertura** — `%` de canais ativos sobre o total. Sub: "de 7 disponíveis". Ícone `Activity`.
3. **Última conexão** — timestamp mais recente (`updatedAt`) formatado em pt-BR ("há 2 dias"). Sub: nome do canal. Ícone `CheckCircle2`.
4. **Pendentes** — canais sem configuração. Sub: lista curta ("Instagram, X, Threads"). Ícone `KeyRound`, tone amber se > 0.

### Aba Mensageria (3 ferramentas)

Fonte: mesmos `data?.channels` filtrando por `resend`, `whatsapp_evolution`, `whatsapp_cloud`, + `brand_api_credentials` (já espelhado em `channels.connected`).

1. **Ferramentas conectadas** — `X / 3`. Ícone `Send`, tone emerald/amber/rose.
2. **Chaves cifradas** — total de credenciais salvas com AES-256-GCM. Sub: "AES-256-GCM". Ícone `KeyRound`, tone violet.
3. **Última rotação** — `updatedAt` mais recente entre as 3. Sub: nome da ferramenta. Ícone `Activity`.
4. **Pendentes** — ferramentas sem credencial. Sub: lista ("WhatsApp Cloud, Resend"). Ícone `CheckCircle2`, tone amber se > 0.

### Detalhes técnicos

- Arquivo único: `src/routes/_authenticated/connections.tsx`.
- Criar dois helpers locais (`buildChannelKpis`, `buildMessagingKpis`) que recebem `data?.channels` e retornam os 4 valores calculados.
- Reutilizar `formatDistanceToNow` de `date-fns` com locale `ptBR` (já usado em outras telas — confirmar import).
- Nenhuma mudança em server functions ou banco: todos os dados já vêm de `getConnections`.
- Manter o mesmo espaçamento (`space-y-3`) e grid dos KPIs de IA para consistência visual.
