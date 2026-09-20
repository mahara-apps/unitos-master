# Correção local dos gates do Master 1.4.17

## Objetivo
Fechar localmente os bloqueios comprovados no último preflight, sem acessar ou alterar qualquer ambiente remoto.

## Implementação
1. **Inventário canônico do Control-plane**
   - Criar um manifesto selado com tabelas, RPCs, funções, triggers, assinaturas e hashes exigidos para o freeze 1.4.15 e o executor determinístico 1.4.17.
   - Criar um diagnóstico somente leitura que compare esse manifesto com um relatório exportado do Control-plane e classifique cada item como `PASS` ou `BLOCK`.

2. **Instalação remota separada e fail-closed**
   - Separar a instalação do freeze e a instalação do executor determinístico em comandos independentes.
   - Exigir backup restaurável global, identidade exata do Master, autorização específica por etapa, preflight read-only, transação única e verificação posterior.
   - Impedir que esses comandos ativem freeze, executem recovery/UPDATE ou aceitem exceção descartável global.

3. **Finalização determinística do UPDATE**
   - Endurecer a RPC para validar o baseline completo, release/commit publicados, SHA e quantidade do pacote, reconciliação, validação e ledger ordenado sem lacunas/duplicidades.
   - Manter lease vigente e fencing; atualizar operação, instalação, `current_version`, `pinned_release` e `pinned_commit_sha` na mesma transação.
   - Falhar sem promoção quando qualquer evidência estiver ausente ou divergente.

4. **Diagnóstico de versões sem deploy**
   - Criar ferramenta local que receba evidências exportadas de release local, Control-plane e produção.
   - Não acessar rede nem inferir valores ausentes; produzir JSON com `PASS`/`BLOCK`, campos ausentes e divergências.

5. **Testes e documentação**
   - Cobrir objetos ausentes, assinaturas/hashes divergentes, bypass de comandos, autorização/backup/preflight, baseline inválido, ledger incompleto/duplicado/fora de ordem, fencing perdido e promoção atômica.
   - Documentar as etapas remotas independentes e todas as autorizações: backup, instalar freeze, ativar freeze, tratar Apex, recovery e UPDATE.
   - Atualizar os artefatos MASTER-first e o verificador do Master.

## Validação local
- Testes focados, incluindo PostgreSQL isolado.
- `master:check`.
- Typecheck.
- Lint dos arquivos alterados.
- Build.

## Limites
Nenhuma consulta ou escrita remota; nenhuma alteração da operação Apex; nenhum freeze, recovery, UPDATE, migration, deploy, publicação ou reativação do cron.
