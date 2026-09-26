# Sincronizar versões em massa com segurança

## Objetivo
Adicionar ao painel do MASTER um botão **Sincronizar versões** que reúna todas as instalações aptas e as atualize pela fila sequencial já implementada. O fluxo individual e a seleção manual continuam disponíveis e inalterados.

## Experiência no painel
1. Exibir **Sincronizar versões** junto de **Atualizar selecionadas**. O botão considera todas as instalações cadastradas, independentemente da busca ou filtro visível, mas nunca inicia algo imediatamente.
2. Ao clicar, fazer uma pré-verificação no servidor e abrir a revisão com dois grupos:
   - **Entram na fila:** desatualizadas, saudáveis, já validadas, configuradas para publicação e sem operação ativa.
   - **Não entram:** atualizadas, não verificadas, com erro/atenção, em atualização ou sem configuração necessária, sempre com o motivo.
3. Manter a dupla confirmação já aprovada: primeiro revisar a lista e a ordem; depois digitar `ATUALIZAR N INSTALAÇÕES` no diálogo crítico existente. Se a lista, versão ou commit mudar entre as etapas, cancelar o início e exigir nova revisão.
4. Após confirmar, acompanhar tudo no bloco **Atualização em fila** já existente. A fila continua uma instalação por vez; falha ou bloqueio interrompe as seguintes e exige decisão manual.
5. Se nenhuma instalação estiver apta, não abrir confirmação: informar que todas já estão sincronizadas ou mostrar os impedimentos encontrados.

## Implementação mínima e segurança
- Reaproveitar `runAutomatedUpdateFn`, operações duráveis, `batchId`, posições da remessa, auditoria, locks, leases, checkpoints, polling e o claim sequencial existentes. Não criar rota, tabela, coluna, RPC ou processo paralelo.
- Evoluir a própria função atual com um modo de pré-verificação geral e um modo de início geral. O servidor, e não o navegador, calculará a lista elegível e confirmará novamente a lista exata antes de criar operações.
- Preservar a atualização manual por seleção, inclusive seu limite atual. A sincronização geral não dependerá das caixas marcadas nem dos filtros da tela.
- Permitir uma única remessa geral, mesmo quando houver mais de 20 instalações aptas, mantendo execução estritamente sequencial. Aplicar um limite técnico alto e explícito apenas para proteger a requisição; se ele for atingido, não iniciar parcialmente e informar o bloqueio.
- Fixar uma única versão, commit e pacote para toda a remessa. Se o MASTER mudar durante o preparo, nenhuma continuação silenciosa será permitida.
- Registrar na auditoria quem autorizou, versão, commit, alvos incluídos e exclusões, sem credenciais. Requisição repetida com o mesmo identificador continuará idempotente.
- Não alterar RBAC, RLS, autenticação, dados de negócio ou o comportamento das atualizações individuais.

## Validação
- Cobrir: nenhuma apta; uma apta; várias aptas; mais de 20 aptas; filtros ativos; instalação atualizada; não verificada; com erro/atenção; sem publicação configurada; operação ativa; mudança da versão/commit durante a confirmação; clique/requisição duplicados; fechamento e reabertura da página; falha no meio da fila; retomada manual; concorrência com atualização individual.
- Confirmar que somente a primeira operação pode executar, que a próxima só é liberada após sucesso reconciliado e que uma falha mantém as restantes aguardando decisão.
- Validar primeiro em ambiente descartável e conferir versão efetivamente publicada, migrations, checkpoints e saúde; não considerar o simples disparo como sucesso.

## Entrega MASTER-first
1. Implementar no MASTER e acrescentar testes focados sem aumentar timeout, pular testes ou mascarar falhas.
2. Regenerar o pacote com `build_delta.py`.
3. Sincronizar `delta_version.txt` e `MASTER_RELEASE_VERSION` na nova versão.
4. Atualizar os verificadores apenas se algum contrato do pacote exigir cobertura adicional; não há previsão de novo objeto de banco.
5. Executar `bun run master:check` e a suíte global. Se o acesso ao ambiente descartável continuar bloqueado, registrar o bloqueio e não declarar validação completa.
6. Publicar o MASTER e usar a sincronização real nas instalações somente após autorização explícita posterior.
