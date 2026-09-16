# Corrigir confirmação do vínculo GitHub na Vercel

## Implementação

- Centralizar a normalização e validação do vínculo Vercel por team, tipo GitHub, repositório e branch `main`.
- Consultar de forma somente leitura tanto o projeto quanto `GET /v10/projects/{projectId}/link`, aceitando a confirmação consistente de qualquer resposta válida e sem usar `sourceless` como veto.
- Manter bloqueio explícito para team, repositório, branch ou tipo de vínculo divergentes; não criar nem religar recursos quando o vínculo já estiver comprovado.
- Reutilizar a mesma regra no `ensureProject`, no `linkRepository` e na preparação do deployment para evitar interpretações divergentes e preservar retries idempotentes.

## Testes e validação

- Cobrir `sourceless=true` e `false`, repositório divergente, branch divergente, vínculo ausente/tipo incorreto e confirmação pelos dois endpoints.
- Executar testes focados, suíte de instalação, typecheck, lint, build e `master:check`.
- Aplicar o ciclo MASTER-first ao código propagável, sem publicar, executar NEW/RESUME ou alterar GitHub, Supabase, Vercel, Taveira ou `unitos-new-teste-02`.
