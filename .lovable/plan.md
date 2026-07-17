
# Unificação da camada de memória — brain_memory como fonte única

## Diagnóstico

Duas tabelas com responsabilidades sobrepostas:

| | `brain_memory` (nova) | `brain_knowledge` (legado) |
|---|---|---|
| Chave lógica | `(brand_id, scope, memory_type, key)` | `(brand_id, category, key)` |
| Confidence | ✅ com `previous_confidence` + WMA via `brain_memory_evolve` | ✅ simples, só `reinforcement_count` |
| Versionamento | ✅ `brain_memory_versions` + trigger snapshot | ❌ nenhum |
| Lifecycle | ✅ evolve / touch / decay / archive | ❌ nenhum |
| Origem/evidência | ✅ `source_refs` + `source_event` | ⚠️ `source_event_ids` (ARRAY) |
| Writers ativos | Brain API (`memory.*`, `evolve`, `remember`) | **nenhum** |
| Readers ativos | Brain API + widgets | apenas `brain-intelligence.functions.ts` (KPIs de contagem) |
| Linhas em produção | **0** | **0** |

Conclusão: `brain_knowledge` está morta operacionalmente. `brain_memory` já é superconjunto funcional. Sem risco de perda de dados (ambas vazias), mas a migração assume que qualquer linha futura em `brain_knowledge` deve ser copiada antes do DROP.

## Decisões de consolidação

1. **Fonte única**: `brain_memory` passa a ser a ÚNICA tabela de memória/conhecimento. `brain_knowledge` é descontinuada.
2. **Chave canônica**: `(brand_id, scope, memory_type, key)` — já existente. `category` (legado) mapeia para `memory_type`.
3. **Confidence**: mantém-se o esquema `brain_memory` (`confidence` + `previous_confidence` + WMA via `brain_memory_evolve`).
4. **Versionamento**: mantém `brain_memory_versions` + trigger `brain_memory_snapshot()`.
5. **Lifecycle**: mantém `evolve` / `touch` / `decay` / `archive`.
6. **Evidência**: `source_refs` (JSONB) absorve `source_event_ids` como `{ event_ids: [...] }`.

## Migração (não destrutiva → destrutiva em 2 fases)

### Fase A — Backfill defensivo (safe, reversível)
Mesmo com 0 linhas hoje, o script cobre o caso de linhas terem sido criadas entre plano e execução:

```sql
INSERT INTO public.brain_memory
  (brand_id, client_id, memory_type, scope, key, content,
   confidence, source_refs, reinforcement_count, origin, status)
SELECT
  bk.brand_id,
  bk.client_id,
  bk.category                                    AS memory_type,
  'brand'                                        AS scope,
  bk.key,
  jsonb_build_object('value', bk.value)         AS content,
  bk.confidence,
  jsonb_build_object(
    'event_ids', COALESCE(bk.source_event_ids, ARRAY[]::uuid[]),
    'legacy_source', bk.source
  )                                              AS source_refs,
  bk.reinforcement_count,
  'migration:brain_knowledge'                    AS origin,
  'active'                                       AS status
FROM public.brain_knowledge bk
ON CONFLICT (brand_id, scope, memory_type, key) DO NOTHING;
```

### Fase B — Remoção da tabela legada
Executada só depois de:
- backfill confirmado (contagens iguais),
- código de leitura repointado para `brain_memory`,
- typecheck + lint verdes.

```sql
DROP TRIGGER IF EXISTS brain_knowledge_touch ON public.brain_knowledge;
DROP TABLE public.brain_knowledge;
```

## Alterações de código (não-destrutivas)

- `src/lib/brain/legacy/brain-intelligence.functions.ts`: substituir todas as 7 leituras de `brain_knowledge` por leituras equivalentes em `brain_memory` (filtro `status = 'active'`; `category` → `memory_type`). KPIs "Conhecimentos" e "Memórias" passam a exibir buckets diferentes da MESMA tabela (`memory_type IN ('fact','pattern',…)` vs. todas).
- `src/lib/brain/README.md`: remover a distinção `Memory Store` vs. `Knowledge` — só existe Memory Store.
- `src/lib/brain/DEPRECATION.md`: registrar `brain_knowledge` como REMOVED nesta fase.
- Nada muda na API pública (`brain.memory.*`, `brain.remember`, `brain.evolveMemory`, `brain.searchKnowledge` continuam idênticos — `searchKnowledge` já lê `brain_memory`).

## Ordem de execução

1. Aplicar migração Fase A (backfill idempotente).
2. Repointar `brain-intelligence.functions.ts` para `brain_memory`.
3. Rodar typecheck + lint.
4. Aplicar migração Fase B (DROP `brain_knowledge`).
5. Atualizar README + DEPRECATION.

## Riscos & mitigações

- **Regressão em consumidores externos**: nenhum consumidor externo escreve em `brain_knowledge` (grep exaustivo confirmou). Risco: nulo.
- **Perda de dados**: coberta pelo backfill idempotente antes do DROP.
- **Guardrails ESLint**: `no-restricted-syntax` já bloqueia `.from("brain_*")` fora de `src/lib/brain/**` — nada a mudar.
- **Types**: `types.ts` é regenerado pelo Supabase após a migração; nenhum consumidor externo depende de `Tables<'brain_knowledge'>`.

## Aprovação necessária

Confirme para eu executar Fase A + repointar leituras + Fase B numa sequência única, ou peça para eu parar entre A e B para revisão.
