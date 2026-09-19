# Último hardening local da recovery 1.4.14

## Objetivo
Eliminar as lacunas locais de integridade do executor antes de qualquer ensaio PostgreSQL isolado, sem mudar o SQL funcional da recovery e sem executar operações externas.

## Alterações
- Fixar e validar uma versão única da Supabase CLI; documentar e validar fail-closed o formato esperado do `db push --dry-run`.
- Conferir o manifesto e o SHA-256 da recovery antes da cópia, após a cópia e imediatamente antes da execução.
- Validar individualmente o SHA-256 de cada migration histórica copiada ao staging, usando o arquivo local autorizado como origem.
- Rejeitar duplicidades de versão, nomes inesperados, arquivos extras e qualquer divergência entre manifesto, origem e staging.
- Capturar um snapshot canônico do ledger e revalidá-lo após o dry-run e imediatamente antes do push, abortando diante de alteração concorrente.
- Documentar explicitamente as janelas residuais entre preflight, dry-run, última validação e execução.
- Adicionar testes unitários independentes para versão/formato da CLI, hashes de origem/staging/histórico, duplicidades, divergência do manifesto e mutação concorrente do ledger.

## Validação local
- Regenerar e conferir somente o manifesto local da recovery quando necessário.
- Executar os testes focados da recovery/promoção e os guardiões `master:check`.
- Executar typecheck, lint focado e conferir o build automático.
- Apresentar o diff efetivo, arquivos alterados, resultados e riscos residuais.

## Limites
Nenhum acesso externo, SQL remoto, `db push` real, NEW, UPDATE, retry, P0, publicação ou deploy será executado.
