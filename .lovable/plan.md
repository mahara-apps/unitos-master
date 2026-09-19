# Correção local dos bloqueadores da recuperação 1.4.14

## Objetivo
Endurecer exclusivamente o mecanismo local já existente, sem mudar o SQL funcional da recuperação e sem executar qualquer operação remota.

## Alterações
- Trocar toda verificação da pseudo-role `PUBLIC` por inspeção exclusiva da ACL expandida, considerando `grantee = 0` como acesso público.
- Selar o diretório temporário de migrations com SHA-256 após o dry-run e conferir o mesmo hash imediatamente antes da execução oficial.
- Manter a fila restrita à recovery `20260919143000`, bloqueando explicitamente 1.4.10, reaplicação da 1.4.11 e qualquer migration adicional.
- Ampliar os testes unitários com cenários independentes para ledger proibido, seleção proibida, preflight incompleto, pseudo-role PUBLIC e alteração do staging.
- Atualizar manifesto, documentação local e roadmap somente no necessário para refletir as novas proteções.

## Validação local
- Regenerar e conferir o manifesto de hashes da recovery.
- Executar apenas os testes unitários relacionados.
- Executar typecheck, lint dos arquivos alterados e build local.
- Revisar e apresentar o diff efetivo e a lista de arquivos alterados.

## Limites
Nenhum SQL remoto, `db push` real, NEW, UPDATE, retry, P0, publicação ou deploy será executado.
