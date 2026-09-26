# Preservar dados e definir a distribuição segura da 1.4.42

## Decisão e alcance
- Não executar atualizações enquanto as versões e os efeitos reais em cada instalação não estiverem comprovados.
- Casa 8, Apex e unitos-new-teste-02 já estão registradas na 1.4.42: mantê-las, sem reinstalar nem reaplicar migrations.
- Taveira está registrada na 1.4.39: avaliar separadamente uma atualização **direcionada exatamente à 1.4.42**, preservando dados e progresso.
- NXT permanece na 1.4.43, conforme sua escolha; não tentar voltar à 1.4.42 nem alterar seu histórico. A antiga unitos-teste (1.3.48, operação falha) fica fora deste lote até diagnóstico próprio.

## Antes de qualquer liberação
1. Conciliar por instalação o que consta no painel, o commit Git efetivamente publicado, o pacote SQL, os checkpoints, as migrations e a versão executada. Mostrar a divergência explicitamente, sem chamar a versão “disponível” de “instalada”.
2. Conter **somente** as operações pendentes do lote atual cujo alvo selado é 1.4.43; preservar íntegros seus registros, evidências e tentativas. Confirmar por leitura que não existem executores ativos. Não usar “Sincronizar versão”, “Reiniciar” ou novo “Atualizar” como atalho.
3. Auditar diretamente cada destino em somente leitura: disponibilidade, esquema e dados representativos, contagens, ledger, credenciais de acesso e eventuais efeitos de operações anteriores. Um número de versão no painel não comprova integridade dos dados.

## Caminho técnico condicional
4. Investigar se o MASTER **publicado** consegue autorizar um pacote histórico 1.4.42 imutável e verificável. O fluxo inspecionado escolhe o commit atual do MASTER e sela esse pacote; portanto, a autorização normal hoje não significa “instalar 1.4.42”. Não trocar apenas o rótulo da versão nem editar o alvo de uma operação selada.
5. Se o caminho histórico não existir, desenhar a menor alteração no MASTER publicado para selecionar e validar explicitamente o pacote 1.4.42 **somente para a Taveira**, com autorização auditável e bloqueio de incompatibilidades. Não criar tabelas, campos ou rotas sem necessidade comprovada; não tocar RBAC/RLS/auth nem dados de negócio.
6. Ensaiar com estado fiel da Taveira e do lote: erro/timeout, ausência real, resposta válida, perda de resposta após commit, retomada e repetição. Demonstrar que migrations já aplicadas não se repetem e que o destino chega à validação final sem perda de dados. Rodar testes focados, suíte global sem afrouxar critérios e guardiões MASTER-first; se faltar acesso, declarar bloqueio, não liberar por presunção.

## Autorizações separadas
7. Apresentar inventário e evidências antes de pedir autorização para **publicar** a correção no MASTER, com pacote, versão, SHA e verificações sincronizados.
8. Só depois, pedir autorização **separada** para retomar a Taveira, acompanhar até o fim e auditar novamente o destino. As instalações já na 1.4.42 ficam como estão; a NXT continua fora.

**Regra de segurança:** não há garantia honesta de “dados preservados” apenas por escolher a 1.4.42. A garantia operacional depende da auditoria direta, cópia de segurança verificável, ensaio fiel, ausência de reexecução indevida e validação pós-atualização. Até lá, nenhuma instalação deve avançar.
