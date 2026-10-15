<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## KPIs

Todo KPI/resumo numerico deve usar `PageKpi`/`PageKpiGrid` (`src/components/ui/page-kpi.tsx`).
Nao criar componentes locais de KPI/Stat/Metric; legados devem ser adaptadores finos de `PageKpi`.
Ver DESIGN_SYSTEM.md secao 3.0.

## MASTER-first (regra obrigatoria)

Toda alteracao exige pacote MASTER propagavel, nesta sequencia:

1. Aplicar a alteracao no MASTER (migration/seed/codigo).
2. Regenerar o pacote: `python3 supabase/baseline-snapshot/tools/build_delta.py`.
3. Atualizar `supabase/baseline-snapshot/tools/delta_version.txt` (sha256 impresso
   pelo gerador + nova `version`) e `MASTER_RELEASE_VERSION` em
   `src/lib/installation/manager-contract.ts` com o MESMO valor.
4. Cobrir o que foi criado em `supabase/install/verify-installation.sql`
   (tabelas novas entram na checagem 80).
5. Rodar `bun run master:check` — reprova se pacote, versao ou relatorio de
   saude ficarem fora de sincronia.
6. Publicar o MASTER e autorizar "Atualizar" em cada instalacao.

ACL cliente: revogar privilégios perigosos de anon em tabelas novas; defaults podem ser herdados.
Update falha abre nova operação com pacote publicado e reconcilia ledger; nunca faz retry de provision.

## Tarefas, peças e navegação

Minhas tarefas filtra antes do limite e pagina sob RLS; atribuições usam `can_access_client`. Peças movem via `movePostFn`; produção exige confirmação. Em Projetos: Projeto > Task > Sub-task > Checklist. Sidebar: Gestão = Projetos/Tarefas; Produção = Calendário/Pautas/Conteúdo/Mídia paga.

Read-only work projections identify each item by source type plus row ID, derive Task client from its project, and fail closed on missing or inconsistent project reads; never merge editorial items or widen RLS. Why: similarly named records are independent and must remain scoped and distinguishable.

## Regras canônicas

Inspeção de instalação compara cadastro, deploy e navegador somente em leitura; cadastro não é endereço efetivo antes da sincronização.

IA exige conexão e chave; texto usa OpenAI/Claude/Gemini como principal e Groq como fallback automático exclusivo, com schema portátil normalizado. Pauta mensal roda em segundo plano via `ai_jobs`.

Health checks de IA são isolados por workspace; jobs e peças usam lease/fencing e efeitos idempotentes para impedir replays e escritas tardias.

Duplicação usa RPC transacional idempotente; não copia histórico nem vínculos editoriais.

Modelos: textos selecionados, criação sem histórico; gestão só Owner/Admin/Super Admin via RPC/RLS para evitar escalada.

AI financial state is durable per workspace/provider; generation checks it before requests and only an administrator-confirmed generation probe can clear it. Why: model listing does not establish credit availability.
AI catalog and budget reads fail closed on transport errors or invalid responses; only confirmed empty results use defaults. Why: outages must not silently select obsolete models or bypass limits.
Successful AI generation awaits usage accounting; embeddings share budget checks and use embedding prices. Why: accounting failure must not be reported as metered success or trigger paid fallback.
Budget alerts run transactionally on usage/settings writes and deduplicate by workspace/month/threshold. Why: notifications must work without an open browser and never represent provider balance.

Content production stages and work statuses are workspace-owned with no per-client exceptions: primary client pipelines change only through the admin-scoped transactional apply RPC (snapshot fingerprint, actor-scoped idempotency, explicit destinations for occupied removed stages, per-post stage snapshots), and a DB guard blocks local edits. Why: divergent names/order across clients break unified boards and reports, and pieces must never be lost.

The content production group in Work statuses reuses the canonical workspace stage editor and maps completion directly to is_terminal; never duplicate these stages in work_statuses or merge them into task projections. Why: both settings surfaces must share one source of truth and the same preview, exception and authorization safeguards.
- Every install/update writes the installation domain as Supabase Auth site_url and merges it into uri_allow_list (src/lib/installation/auth-urls.ts). Why: otherwise password-reset/invite links fall back to localhost.
- Structured AI text calls set an explicit output cap and treat finishReason "length" as output_truncated (src/lib/ai/output-budget.ts); large lists are generated in batches. Why: provider defaults truncate JSON silently.
