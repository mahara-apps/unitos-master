# Proteção local do comando de freeze

## Implementação
- Conectar `control_plane_freeze.sh` ao gate de backup com escopo global antes de qualquer consulta preparatória ou escrita de `freeze`/`unfreeze`.
- Manter `status` estritamente somente leitura e sem exigir backup.
- Preservar identidade exata do Master, autorização específica, motivo, operador, geração esperada, preflight de quiescência e fencing transacional já aplicado pela RPC.
- Registrar a decisão do gate em JSONL sem credenciais ou URL de conexão; rejeitar exceção descartável no escopo global.
- Evitar parâmetros adicionais, curingas e modos desconhecidos.

## Testes e validação
- Adicionar testes executáveis do comando com `psql` simulado: sem backup, backup válido, exceção global rejeitada, operador/evidência ausentes, autorização ausente, preflight ativo e preservação da geração/fencing.
- Incluir os testes no `master:check` e atualizar a documentação operacional local.
- Executar testes focados, `master:check`, typecheck, lint dos arquivos alterados e build.

## Limites
- Nenhum acesso ou estado remoto será usado ou alterado.
- Não serão executados recovery, UPDATE, migrations, deploy, publicação ou reativação de cron.
