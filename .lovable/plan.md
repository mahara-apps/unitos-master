# Protocolo de backup do Unitos Master

## Objetivo
Manter backup restaurável como requisito padrão para qualquer escrita crítica no Control-plane e permitir uma exceção estritamente vinculada a uma instalação descartável, sem reduzir proteções globais nem executar ações remotas automaticamente.

## Implementação
1. Criar um gate local reutilizável que aceite somente uma destas evidências:
   - backup restaurável confirmado, identificado e registrado; ou
   - exceção descartável com instalação específica, confirmação explícita do operador e declaração do risco aceito.
2. Aplicar o gate ao executor de promoção/recuperação antes da primeira escrita, cobrindo recovery, migrations, ledger, permissões e configurações críticas.
3. Tornar a exceção inválida quando faltar identidade da instalação, confirmação ou risco; impedir curingas, escopo global e qualquer tentativa de desativar freeze, fencing, preflight, integridade do staging ou demais proteções do Control-plane.
4. Registrar somente a evidência operacional não secreta no output local antes da execução; o protocolo não fará backup, freeze, recovery, migration, UPDATE, deploy ou publicação por conta própria.
5. Documentar os dois caminhos e a separação entre exceção de backup e autorização da escrita.

## Testes
- Backup obrigatório bloqueia quando a evidência estiver ausente ou incompleta e libera apenas com confirmação válida.
- Exceção descartável bloqueia uso global/incompleto e libera somente para a instalação explicitamente identificada com risco aceito.
- Confirmar que todas as proteções existentes continuam obrigatórias.
- Executar testes focados, `master:check`, typecheck, lint e build.

## Limites
Somente alterações e testes locais. Nenhuma operação remota, mudança na Apex, ativação do cron, recovery, UPDATE, migration, publicação ou deploy.
