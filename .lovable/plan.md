## Objetivo
Tornar o "Plano do Mês" 100% textual (headlines + legendas) e distribuir as peças no calendário conforme a volumetria mensal do briefing.

## Diagnóstico
- O pipeline atual **já não gera imagens** — a etapa "Direção de arte" produz apenas um `design_brief` em texto anexado à copy. O nome está gerando confusão.
- As peças são inseridas no pipeline (`stage_id = idea`), mas **sem `scheduled_at`**, então não aparecem no calendário (`/calendar`) — só no kanban `/content`.

## Mudanças

### 1. Remover a etapa "Direção de arte" (`src/routes/api/jobs/monthly-plan.ts`)
- Eliminar a chamada ao `briefPrompt` / `BriefSchema` no `Promise.all` por conceito.
- Remover o `design brief` anexado ao campo `copy` do post.
- Atualizar labels e mensagens:
  - `step_label`: "Copywriter (N peças)" e "Planejador estratégico — gerando conceitos".
  - Notificação final: "Planejador + Copywriter concluídos para <período>".
  - Subtítulo do job: "Planejador → Copywriter · N peças".
- Manter os agentes seed apenas de planejamento e copywriting em uso (não apagar os demais registros).

### 2. Distribuir peças no calendário
Ao montar os `rows` para insert em `posts`, calcular `scheduled_at` para cada peça:
- Determinar o mês/ano do `input.periodo` (formato usual "YYYY-MM" ou nome do mês) — fallback para o mês corrente.
- Listar os dias úteis (seg–sex) do mês.
- Distribuir as N peças uniformemente pelos dias úteis (round-robin), horário padrão `10:00` local (UTC-3 armazenado como ISO UTC).
- Se houver mais peças que dias úteis, permitir múltiplas no mesmo dia com horários escalonados (10:00, 14:00, 17:00).
- Preencher `posts.scheduled_at` com o ISO resultante.

### 3. Ajustar textos no cliente
- `src/components/customer/monthly-plan-dialog.tsx`: descrição do fluxo passa a "Planejador estratégico gera os conceitos e o copywriter escreve as headlines/legendas — as peças caem no pipeline e no calendário".
- Sem mudanças em outros componentes.

## Fora de escopo
- Não mexer nos agentes/prompts de Brief Visual (ficam no banco, apenas não são chamados aqui).
- Não alterar a UI do calendário nem a de kanban.
- Não gerar imagens em nenhum ponto.

## Verificação
1. Rodar "Gerar Plano do Mês" no cliente Café Aurora.
2. Confirmar no `/content` que as peças foram criadas sem bloco "Design brief" na copy.
3. Confirmar no `/calendar` que as peças aparecem espalhadas nos dias úteis do mês.
4. Verificar via `supabase--read_query` que `posts.scheduled_at` está preenchido para os novos registros.
