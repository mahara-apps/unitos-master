# Recuperar a fila múltipla sem reexecutar a NXT

## Diagnóstico comprovado
- A remessa contém exatamente cinco operações; não houve perda ou criação parcial de itens.
- A NXT concluiu as cinco etapas e as 93 migrations, mas o Control-plane encerrou a operação sem preencher `reconciled_at` nem promover `pinned_release`/`pinned_commit_sha`.
- As quatro sucessoras nunca começaram: estão `pending`, sem tentativa, lease, erro ou checkpoint. O cron continuou rodando, mas retornou zero claims.
- A trava da fila está correta: o próximo item só pode ser assumido após o predecessor estar concluído, reconciliado e com os pins correspondentes.
- A causa é incompatibilidade entre o finalizador antigo instalado no Control-plane e o contrato atual. Além disso, o código-fonte validava fingerprints como SHA-256, enquanto o executor grava o `deltaFingerprint` operacional; o SHA-256 canônico já fica separado em `baseline_hash`.
- O “Etapa 4/5” exibido nas quatro instalações é estado visual impreciso; não representa execução real.

## Correção preparada no MASTER
1. Corrigir somente o contrato do finalizador para aceitar o formato operacional realmente emitido e continuar rejeitando formatos desconhecidos.
2. Atualizar installer e verificador para impedir reinstalação do contrato incompatível.
3. Disponibilizar um reparo transacional, explícito e de uso único para a NXT: ele exige freeze, identidade exata da operação/remessa/release/commit/pacote, cinco etapas concluídas, 93 posições contíguas e ausência de lease ou operação concorrente.
4. O reparo apenas completa a reconciliação e os pins que faltaram; não apaga registros, não repete migrations e não toca em dados de negócio, RBAC, RLS ou autenticação.
5. Depois da promoção correta do finalizador, liberar a fila existente para o claim normal assumir Casa 8, Apex, Taveira e unitos-new-teste-02, uma por vez.
6. Pausar imediatamente se qualquer instalação falhar; não avançar nem marcar sucesso por inferência.

## Validação e execução controlada
- A reprodução PostgreSQL local comprovou os três controles: evidência válida reconcilia, hash divergente falha fechado e ledger ausente falha fechado.
- O MASTER 1.4.44 está preparado localmente; pacote, versão, hashes, bootstrap, recovery e verificadores estão sincronizados.
- `bun run master:check` passou integralmente, com 203 testes locais e ensaios PostgreSQL, sem aumentar timeout ou mascarar falhas.
- A suíte global continua dependente do acesso válido ao ambiente descartável; isso não será declarado como aprovado enquanto o token permanecer recusado.
- Nenhum ambiente remoto foi alterado.

## Ordem proposta para produção
1. Autorizar e publicar o MASTER 1.4.44.
2. Fazer preflight somente leitura e backup do Control-plane.
3. Congelar operações pelo mecanismo existente e instalar o finalizador corrigido com os verificadores canônicos.
4. Revalidar a evidência real da NXT e executar o reparo transacional autorizado.
5. Confirmar `reconciled_at`, pins, freeze e histórico antes de liberar qualquer sucessora.
6. Descongelar e acompanhar a fila existente sequencialmente até conclusão ou primeira falha.
7. Auditar cada destino após o término: versão, 93 migrations, validação, publicação e saúde.

A publicação, a instalação do contrato no Control-plane, o reparo da NXT e a retomada da fila são atos remotos separados e exigem autorização explícita antes de execução.
