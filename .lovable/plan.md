# Reparação controlada do Control-plane 1.4.18

## Objetivo

Adicionar ao painel exclusivo de Super Admin um fluxo preparatório, integralmente fail-closed, que mostre o estado remoto comprovado, organize o bootstrap do Control-plane existente e gere um relatório operacional. Nesta entrega, nenhuma ação remota será executada e nenhum segredo será armazenado ou exibido.

## Implementação

1. Criar um contrato puro e versionado de reparação para o MASTER 1.4.18, com referência canônica, bloqueios conhecidos, artefatos selados, dependências, ordem obrigatória, critérios de aprovação, rollback possível e validações posteriores.
2. Modelar os gates independentes: identidade/conexão autorizada, operador autenticado, justificativa específica, confirmação literal de risco, auditoria JSONL persistente, preflight, freeze, executor, ledger/checkpoints, recovery 1.4.14, validação final e cron.
3. Garantir no contrato que Apex e sua operação pendente sejam imutáveis durante o bootstrap; cancelamento, exclusão, conexão alternativa, bypass e cron antecipado permanecerão proibidos.
4. Adicionar uma função autenticada e somente leitura para montar o relatório a partir do estado já conhecido pelo MASTER, sem executar SQL remoto, migrations, scripts, cron ou operações.
5. Criar uma tela de “Reparação do Control-plane” dentro de Instalações, visível apenas no MASTER para Super Admin, com:
   - veredito geral BLOCK;
   - bloqueios remotos confirmados;
   - plano ordenado e dependências;
   - checklist dos pré-requisitos e autorizações;
   - proteção explícita da operação Apex;
   - rollback e validações pós-bootstrap;
   - relatório copiável, sem controles de execução nesta etapa.
6. Adicionar acesso claro a essa tela na área de Instalações, sem alterar os fluxos atuais de provisionamento e atualização.
7. Cobrir contrato, autorização, fail-closed, ordem, proibições e conteúdo do relatório com testes de regressão.

## MASTER-first e validação

- Esta entrega não cria nem aplica migration e não altera o pacote SQL Client; se o delta permanecer idêntico, registrar isso objetivamente.
- Executar testes focados, `bun run master:check`, typecheck, lint dos arquivos alterados e validar o build automático.
- Conferir a tela no preview em desktop e mobile, incluindo ausência de sobreposição e estado BLOCK inicial.
- Confirmar no encerramento que nenhuma conexão remota, migration, freeze, recovery, UPDATE, provisioning, cron, deploy ou publicação foi acionada.
