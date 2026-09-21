# Alinhar operações do Control-plane à versão 1.4.20

## Objetivo
Corrigir somente as referências operacionais ainda fixadas em 1.4.19 nos atos locais de promoção do Control-plane e ativação exclusiva do cron 37, sem qualquer acesso ou alteração remota.

## Alterações
- Atualizar o SQL de ativação do cron 37 para exigir `current_version` e `pinned_release` iguais a 1.4.20.
- Atualizar o script de promoção para usar autorização literal, versão-alvo, validação final e mensagens da versão 1.4.20.
- Alinhar os ensaios locais de promoção e cron às mesmas precondições 1.4.20.
- Atualizar referências operacionais diretamente relacionadas no contrato/artefatos gerados e na documentação ativa, sem tocar em registros históricos arquivados.

## MASTER-first e validação
- Regenerar o bootstrap/contrato afetado e o pacote delta conforme as ferramentas canônicas do projeto.
- Atualizar hashes e versões somente se os geradores exigirem, mantendo `delta_version.txt` e `MASTER_RELEASE_VERSION` em 1.4.20.
- Executar os testes locais focados de promoção e cron, o verificador de compatibilidade e `bun run master:check`.
- Confirmar que não restaram referências operacionais 1.4.19 no fluxo ativo.

## Limites
- Nenhuma conexão ou escrita remota.
- Nenhuma recovery, promoção, ativação do cron, claim ou alteração da operação Apex.
- Nenhuma redução de freeze, preflight, hashes, locks, fencing, RLS, RBAC ou autorizações independentes.
- Nenhum novo gate, teste ou auditoria geral.
