## Problema

Hoje temos **dois modais visualmente e funcionalmente distintos** para tarefas no pipeline:

| | Modal "Nova tarefa" (`new-post-dialog.tsx`) | Modal "Detalhes do post" (`post-detail-dialog.tsx`) |
|---|---|---|
| Layout | 2 colunas (conteúdo + sidebar) | 1 coluna corrida |
| Canais | Chips selecionáveis | Ausente |
| Formato | Chips (Feed, Reels…) | Ausente |
| Abas | Legenda / Briefing interno / Briefing cliente / Roteiro | Só campo "Copy" solto |
| Prioridade | Select | Ausente |
| Tags | Editor com chips | Ausente |
| Lembrete | Sim | Ausente |
| Portal | Toggle | Ausente |
| Etapa | Select | Ausente |
| Mídias de referência | Ausente | Uploader com preview |
| Timeline / Aprovação / IA inline | Ausente | Presente |

Resultado: ao abrir uma tarefa criada, o usuário perde acesso à maioria dos campos que preencheu.

## Solução

Criar um único componente `TaskDialog` reutilizável com **o mesmo layout do modal "Nova tarefa"** (2 colunas, chips e abas), operando em dois modos:

- **create**: sem `postId`, botão "Criar", chama `createPostFn`.
- **edit**: com `postId`, carrega via `getPostDetailFn`, botão "Salvar", chama `updatePostFn`. Mantém as seções extras do detalhe (mídias, aprovação, timeline, IA inline, refação, aprovar & gerar).

## Estrutura visual unificada

```text
┌─ Título ───────────────────────────────┐  ┌─ Etapa ─────┐
│ [input]                                │  │ [select]    │
├─ Canais (chips) ───────────────────────┤  ├─ Prazo ─────┤
│ [instagram] [tiktok] ...               │  │ [datetime]  │
├─ Formato (chips) ──────────────────────┤  ├─ Lembrete ──┤
│ [Feed] [Reels] [Stories] ...           │  │ [datetime]  │
├─ Abas ─────────────────────────────────┤  ├─ Prioridade │
│ Legenda | Brief interno | Brief cli    │  │ [select]    │
│         | Roteiro                      │  ├─ Tags ──────┤
│ [textarea + botões IA no modo edit]    │  │ [chips]     │
├─ Mídias de referência (só edit) ───────┤  ├─ Portal ────┤
│ [grid + upload]                        │  │ [switch]    │
├─ Link de aprovação (só edit) ──────────┤  └─────────────┘
├─ Histórico (só edit) ──────────────────┤
└────────────────────────────────────────┘
Rodapé: Cancelar | (Excluir/Refazer só edit) | Salvar/Criar | Aprovar (só edit)
```

## Detalhes técnicos

- Novo arquivo `src/components/content/task-dialog.tsx` implementando o layout unificado.
- Estender `updatePostFn` no `content.functions.ts` para aceitar os campos hoje só existentes em `createPostFn` (`channels`, `format`, `priority`, `tags`, `internal_briefing`, `client_briefing`, `script`, `remind_at`, `visible_in_portal`, `stage_id`, `pipeline_id` já suportados parcialmente — validar e completar).
- Estender `getPostDetailFn` para retornar esses mesmos campos no `post`.
- Manter os botões de IA inline, refação, aprovação e uploader **apenas quando** `mode === "edit"`.
- Substituir os dois consumidores atuais (`content-board.tsx` e o header do `/content`) por `TaskDialog`.
- Deletar `new-post-dialog.tsx` e `post-detail-dialog.tsx` após a migração.
- Manter todas as chamadas server-side existentes (nada muda no schema do banco).

## Fora de escopo

- Mudanças no board Kanban, DnD, SLA ou colunas.
- Fluxo de IA (pipeline, agentes) — apenas os botões inline continuam iguais.
- Portal público / aprovação por token — apenas realocados dentro do novo modal.
