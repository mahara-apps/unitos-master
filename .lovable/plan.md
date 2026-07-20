## Objetivo
Habilitar geração por IA nos campos **Hook** e **Headline** do editor de copy (task-dialog) e garantir que o texto gerado seja persistido junto com os demais campos.

## Situação atual (verificada)
- `src/components/content/task-dialog.tsx` (`COPY_FIELDS`, linhas 1604–1616): apenas `body`, `cta` e `hashtags` têm `aiField` definido, então só esses campos exibem os botões `MicroAiButton` (Sparkles/Wand2). Hook e Headline hoje são apenas textareas manuais.
- `src/lib/copilot-inline.functions.ts` (`aiInlineGenerateFn`): enum aceita apenas `copy | hashtags | cta | script | briefing`. Não há preset para `hook` nem `headline`.
- Persistência: `CopyEditor` serializa todas as seções (`### GANCHO`, `### HEADLINE`, `### COPY`, `### CTA`, `### HASHTAGS`) em `state.copy` e o Save chama `updatePostFn` gravando em `posts.copy` (linhas 532, 721, 956). Ou seja, o texto de Hook/Headline **já persiste** desde que o usuário clique em Salvar; o risco atual é fechar o drawer sem salvar.

## Mudanças

### 1. Backend — `src/lib/copilot-inline.functions.ts`
- Estender o enum do `inputValidator` para incluir `"hook"` e `"headline"`.
- Adicionar dois presets em `FIELD_PROMPTS`:
  - **hook**: system prompt de "especialista em ganchos de rede social" — devolver 3 opções curtas (máx. 12 palavras) numeradas, em pt-BR, aderentes ao formato e briefing.
  - **headline**: system prompt de "editor de headlines" — devolver uma frase única, direta, com a promessa central do post.
- Ambos usam o mesmo contexto (`title`, `format`, `internal_briefing`, `client_briefing`) + blueprint da marca via `buildBrandContextBlueprint`, seguindo o padrão dos presets existentes.

### 2. Frontend — `src/components/content/task-dialog.tsx`
- Ampliar o tipo `aiField` em `COPY_FIELDS` e no `MicroAiButton` para `"copy" | "hashtags" | "cta" | "script" | "briefing" | "hook" | "headline"`.
- Setar `aiField: "hook"` na entrada `gancho` e `aiField: "headline"` na entrada `headline` do `COPY_FIELDS`.
- Nada mais muda no render: os dois botões (Regenerar/Melhorar tom) passam a aparecer automaticamente, chamam `aiInlineGenerateFn` com o novo `field` e escrevem no estado via `setSection`, que já é serializado em `state.copy`.

### 3. Persistência
- O fluxo atual (Save → `updatePostFn` → `posts.copy`) já cobre Hook/Headline porque estão dentro do mesmo campo serializado. **Adicionar** um autosave leve com debounce (~1.2s) no `CopyEditor` para gravar `state.copy` via `updatePostFn` sempre que o texto mudar em modo edição, evitando perda quando o usuário fecha o drawer após gerar com IA. Mostrar indicador discreto "Salvo" / "Salvando…" no rodapé do editor.

## Escopo negativo
- Sem mudanças no schema do banco (o texto continua em `posts.copy`).
- Sem mudanças na UI de tabs, ícones ou estilos.
- Sem alteração no fluxo de aprovação/rework.
