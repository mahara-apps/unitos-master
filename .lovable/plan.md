## Diagnóstico

- O modal `src/components/calendar/generate-plan-dialog.tsx` hoje só pede **posts por semana** e distribui automaticamente entre canais (default cai em Instagram).
- **O backend já aceita mix por canal**: `src/routes/api/jobs/monthly-plan.ts` recebe `channelMix: Record<string, number>` (linhas 29, 266‑273, 310‑…) e força a distribuição obrigatória por plataforma no prompt do Planejador. Canais reconhecidos por `normalizeChannel`: `instagram`, `tiktok`, `linkedin`, `x`/`twitter`, `youtube`, `blog`, `facebook`.
- Não existe hoje um `channel_mix` persistido em briefing/brand para pré-preencher — vamos partir de um default sensato e permitir edição livre.

## O que muda (UI apenas — sem tocar no backend)

No `GeneratePlanDialog`:

1. **Novo bloco "Canais e volume por canal"** substituindo o campo único "posts por semana":
   - Lista fixa dos 7 canais suportados (Instagram, TikTok, YouTube, LinkedIn, Facebook, X, Blog), cada linha com:
     - toggle de inclusão (checkbox)
     - stepper numérico (posts no período) com `-` / `+` e input direto
     - chip com o ícone/cor do canal (reaproveitando `CHANNEL_STYLES` de `src/components/content/channel-styles.ts`)
   - Canais desmarcados ficam esmaecidos e não contam.
2. **Defaults**: Instagram = 8, TikTok/YouTube/LinkedIn/Facebook = 0, X/Blog = 0 (apenas Instagram ligado). O usuário liga o que quiser.
3. **"A partir de quando?"** mantido (Restante do mês / Próximo mês).
4. **Direcionamento extra** mantido.
5. **Resumo dinâmico** na parte inferior:
   - `Total: X peças · Y canais · período Z`
   - Se `total < 3` ou nenhum canal selecionado → botão "Gerar" desabilitado com mensagem.
6. **Payload** para `/api/jobs/monthly-plan`:
   - `quantidade` = soma do mix
   - `channelMix` = `{ instagram: N, tiktok: M, ... }` (apenas canais > 0)
   - `startFrom`, `periodo`, `meses`, `direction` inalterados

## Onde tocar

- `src/components/calendar/generate-plan-dialog.tsx` — refatoração do corpo do dialog. Sem novos arquivos.
- Reuso: `CHANNEL_STYLES` (ícones/cores), componentes shadcn já existentes (`Checkbox`, `Input`, `Button`).

## Fora do escopo

- Persistir mix padrão no briefing/brand (item futuro: coluna `channel_mix jsonb` em `brand_briefings` + preload). Se você quiser, faço em seguida.
- Alterar prompt/agentes — o backend já respeita `channelMix` estritamente.
- Distribuir por semana em vez de total no período — mantemos total por canal (mais simples e é o que o backend consome).

## Verificação

1. Abrir `/content` ou `/calendar` → botão "Gerar novo plano".
2. Marcar Instagram=6, Reels/TikTok=4, Facebook=2 → resumo mostra "Total: 12 peças · 3 canais".
3. Gerar → conferir no board que aparecem cards com badges dos 3 canais na proporção pedida.