# Liberar Casa 8, Apex, Taveira e unitos-new-teste-02 sem depender da NXT

## Situação confirmada

- O lote autorizado contém cinco operações para a versão **1.4.43**. A NXT terminou, mas não tem reconciliação final, e seu commit publicado difere do commit de origem exigido pela regra atual. Por isso a fila não reivindica nenhuma das quatro operações seguintes.
- Casa 8, Apex, Taveira e unitos-new-teste-02 ainda estão **pendentes, sem tentativa, lease ou migrations nesta operação**. O congelamento global está desligado. Não há indicação de que a atualização tenha começado nelas.
- O código local aponta 1.4.42, enquanto a linha publicada inspecionada aponta 1.4.45. Trabalhar a partir da cópia local sem reconciliar essa divergência poderia sobrescrever melhorias recentes.

## Plano

1. **Isolar a NXT sem adulterar o histórico.** Preservar sua operação, versão, commits, ledger e situação de reconciliação. Não marcá-la artificialmente como reconciliada, não apagar o lote nem transformar um sucesso inconcluso em sucesso comprovado.
2. **Preparar uma liberação restrita às outras quatro.** Partir da linha mais recente do MASTER e alterar apenas a regra de reivindicação do lote para que uma autorização auditável e vinculada *a este lote e à operação da NXT* dispense a NXT como predecessora. A dispensa não certifica a NXT nem desliga a ordem interna: Casa 8 → Apex → Taveira → unitos-new-teste-02. Cada uma ainda exige evidência própria antes de liberar a próxima, inclusive a identidade real do código publicado; não comparar o commit do deploy ao commit de origem como se fossem o mesmo objeto.
3. **Falhar fechado antes de executar.** Confirmar o manifesto imutável 1.4.43, as credenciais e o acesso somente leitura a cada destino, os estados atuais e ausência de executor ativo. Se o pacote selado não estiver disponível ou uma evidência for ambígua, manter a instalação correspondente em espera. Nenhum reset, exclusão ou reexecução da NXT.
4. **Validar a falha exata.** Ensaiar com o estado fiel do lote e do ledger, incluindo erro/timeout, ausência real, resposta válida, perda da resposta após confirmação e repetição. Provar que cada sucessora só começa após a validação integral da anterior e que nada é aplicado duas vezes. Auditar diretamente os destinos antes e depois.
5. **Fechar no MASTER.** Regenerar o pacote, sincronizar versão/SHA, atualizar as verificações de instalação, executar testes específicos, suíte global e `bun run master:check` sem afrouxar critérios. Não tocar RBAC, RLS, autenticação ou dados de negócio. Publicar apenas com autorização explícita após apresentar as evidências.
6. **Retomar com autorização separada.** Depois da publicação, solicitar autorização específica para acionar a liberação do lote. Acompanhar uma instalação por vez, conferir código, migrations, checkpoints e saúde e parar as demais diante de qualquer divergência. A NXT permanece fora da retomada e continua com seu incidente próprio em aberto.

## Limite de segurança

“Liberar” não significa remover a trava global ou tratar a NXT como validada. A alteração será limitada a este lote e às quatro instalações indicadas. Se não for possível demonstrar a correção sobre a versão publicada e o destino real, não iniciaremos nenhuma atualização.
