## Objetivo
Corrigir três problemas do wizard "Novo agendamento" e validar o fluxo de agendamento.

## 1) Wizard não abre em branco
No `ScheduleWizard` (`src/components/calendar/schedule-wizard/index.tsx`), o `useEffect` de reset (linhas 134-149) reseta título/copy/mídias, mas usa `seed` como identidade estável. Quando o usuário edita um card pendente e depois clica "Novo" (que faz `setWizardSeed(null)`), certas transições mantêm `pairs`, `hashtags`, `previewChannel` ou upload em estado sujo dependendo da ordem de renders. Além disso, hoje o efeito só roda quando `open` muda, mas não zera o `submitting` nem o `previewChannel`.

Correção:
- Reforçar o reset: separar em uma função `resetAll()` que zera 100% dos estados (title, copy, pairs, selectedMedia, scheduleDate/Time, hashtags, tagInput, firstComment, linkUrl, locationName, previewChannel, submitting, dragActive, uploading).
- Chamar `resetAll()` sempre que `open` transiciona `false → true` (rastrear com `useRef` do estado anterior) e, quando não houver `seed`, garantir campos totalmente vazios.
- Também limpar o `<input type="file">` (`uploadRef.current.value = ""`).

## 2) Botão "Salvar rascunho" (retomar depois)
Adicionar na sticky bottom bar um botão terciário "Salvar rascunho" ao lado de "Cancelar" / "Enviar para aprovação". Ele chama uma nova action `"save_draft"` em `saveScheduledPostFn` que persiste em `posts` com `stage = 'idea'` (ou `'production'`) sem exigir canais/data, e permite reabrir depois via lista de rascunhos. O botão "Enviar para aprovação" continua exigindo canais.

Backend (`src/lib/scheduling-wizard.functions.ts`): permitir `action = "save_draft"` que:
- Cria/atualiza o `posts` com `stage = 'idea'`, salva copy, título, hashtags, mídia, sem `scheduled_at`, sem criar `post_placements` obrigatórios.
- Retorna `{ postId }` para o wizard fechar.

Frontend: mostrar rascunhos salvos no painel lateral (novo bloco "Rascunhos" ou reaproveitar o `PendingSchedulePanel` com uma aba). Ao clicar, reabre o wizard com `seed` preenchido.

## 3) Barra de progresso durante publicação/agendamento
Hoje o botão apenas mostra `Loader2` girando. Adicionar feedback visual real:
- Enquanto `submitting !== null`, renderizar uma barra de progresso fina (shadcn `Progress` ou barra indeterminada animada) fixa no topo da sticky bottom bar.
- Para `action = "publish"`, o backend já processa canal por canal em loop; vamos aproveitar isso: retornar progresso incremental via streaming não vale a pena (custo alto) — em vez disso, mostrar barra indeterminada + label "Publicando em X canal(is)..." usando `pairs.length`, e ao terminar exibir toast por canal (já existe).
- Desabilitar todos os botões e overlay leve sobre as 3 colunas para evitar edição durante submit.

## 4) Validar agendamento
Confirmar que o fluxo `action = "schedule"`:
- Persiste `posts.stage = 'scheduled'` com `scheduled_at` no ISO correto.
- Cria os `post_placements` esperados.
- Aparece no calendário no dia certo.
- Roda um teste manual via Playwright em `/app/calendar`: criar agendamento futuro, verificar que aparece no dia, reabrir, confirmar dados.

## Detalhes técnicos

Arquivos:
- `src/components/calendar/schedule-wizard/index.tsx` — reset completo, botão "Salvar rascunho", barra de progresso, overlay durante submit.
- `src/lib/scheduling-wizard.functions.ts` — nova action `"save_draft"` em `saveScheduledPostFn`; nova server fn `listDraftsFn` (posts do brand/client com `stage='idea'` sem `scheduled_at`).
- `src/components/calendar/pending-schedule-panel.tsx` — adicionar seção/aba "Rascunhos" reutilizando o card já enriquecido.
- `src/routes/_authenticated/calendar.tsx` — nenhuma mudança de contrato; pode passar `seed` também para rascunhos.

Sem migração de banco — reutiliza `posts.stage='idea'` que já existe no enum.

## Fora de escopo
- Progresso real por canal via SSE/streaming.
- Novos formatos além de Feed IG/FB (Stories/Reels seguem bloqueados como hoje).