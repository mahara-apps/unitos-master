# Destravar com segurança a atualização em massa

## Diagnóstico confirmado (somente leitura)

- A Taveira **não iniciou a atualização**: permanece em 1.4.39, com operação em fila, zero tentativas, sem lease e sem migrations registradas nessa operação. O aviso “Atualização em fila autorizada no MASTER” é o resumo da fila, não um erro de aplicação na Taveira.
- O congelamento global está **desligado**. O agendamento de retomada executa a cada minuto, responde 200, mas informa `claimed: 0`.
- O lote contém cinco instalações em ordem: NXT, Casa 8, Apex, Taveira e unitos-new-teste-02. A NXT terminou com sucesso e 93/93 migrations confirmadas; as outras quatro continuam em fila sem tentativas.
- A regra efetiva do banco só libera a próxima instalação quando a anterior tem `reconciled_at` preenchido **e** release e commit fixados iguais ao manifesto. Na NXT, `reconciled_at` está vazio e o commit fixado difere do commit de origem do pacote. A função de finalização instalada no MASTER não grava esses comprovantes, embora a implementação local já os exija. Portanto, clicar em “Reiniciar” na Taveira não resolve a fila e pode comprometer a evidência da operação.
- A tela também mistura referências de versão: a operação foi autorizada para 1.4.43, a cópia local inspecionada declara 1.4.42 e a publicação mostrada na imagem declara 1.4.45. Não trocar o alvo do lote nem presumir que as três referências equivalem.

## Plano de liberação

1. **Conter o lote sem apagar evidências.** Não clicar em Reiniciar, Cancelar, Sincronizar versão ou autorizar outro lote. Confirmar novamente, por leitura, operações, leases, tentativas, snapshots, versões e a ausência de executor ativo. Preservar os registros das cinco instalações.
2. **Verificar a NXT no destino.** Conferir em modo somente leitura a versão e o commit efetivamente publicados, as 93 migrations/ledger, a validação final e a integridade de dados existentes. Comparar o commit Git publicado com o commit de origem selado: a divergência pode representar o commit de disparo do deployment e não deve ser corrigida por suposição. Verificar também backup restaurável antes de qualquer escrita crítica.
3. **Corrigir a causa no MASTER, não na Taveira.** Ajustar o contrato de finalização e a regra de avanço do lote para registrar/aceitar somente evidência canônica comprovada, distinguindo commit de origem de commit Git de disparo; nunca preencher `reconciled_at` ou trocar `pinned_commit_sha` às cegas. Se a NXT não comprovar a atualização, interromper o lote e tratar sua operação primeiro. Não alterar RBAC, RLS, autenticação nem dados de negócio.
4. **Ensaiar a falha exata e as alternativas.** Reproduzir NXT concluída com `reconciled_at` vazio e commits diferentes, além de controles com erro, ausência real e estado válido; provar que a fila não avança em evidência ambígua e avança somente após confirmação transacional. Ensaiar crash após commit, timeout e replay preservando 93 migrations e sem duplicação.
5. **MASTER-first.** Aplicar mudança canônica no MASTER via migration com aprovação, regenerar pacote e bootstrap, sincronizar SHA e versão, cobrir o verificador das instalações, rodar testes focados, ensaio PostgreSQL, `bun run master:check` e suíte global sem aumentar timeout nem pular testes. Relatar bloqueios se a suíte global não tiver acesso ao ambiente de testes.
6. **Liberação em etapas e monitoramento.** Apresentar evidências e pedir autorização explícita **separada** para publicar o MASTER; depois pedir autorização explícita para retomar o lote. Revalidar a NXT, deixar a Casa 8 avançar primeiro, acompanhar Apex, só então Taveira e unitos-new-teste-02. Em cada etapa, comparar ledger, versão, código publicado, validação e saúde antes da seguinte; diante de divergência, manter as demais em espera. Auditar novamente o destino ao final.

## Limites desta etapa

Este plano não executa migrations, recuperação, reinício, publicação, atualização ou escrita em qualquer instalação. A retomada depende de evidência verificável, backup exigido pelo protocolo e autorizações explícitas; não há garantia de ausência de perda de dados sem validar o destino real.