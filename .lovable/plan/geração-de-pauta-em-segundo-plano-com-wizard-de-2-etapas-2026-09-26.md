# Geração de pauta em segundo plano com wizard de 2 etapas

## Resultado esperado

- O painel lateral terá **duas etapas claras**:
  1. **Escopo** — projeto, tema opcional, briefing e modelo de IA.
  2. **Conteúdo** — canais, formatos e quantidades na mesma tela.
- Ao clicar em **Gerar pauta**, o pedido será aceito, o painel poderá fechar imediatamente e a geração continuará em segundo plano.
- O usuário poderá navegar pelo sistema enquanto acompanha o progresso no indicador global de gerações.
- Ao terminar, uma notificação permitirá abrir diretamente a pauta criada; em caso de falha, mostrará a mensagem segura e permitirá tentar novamente sem duplicar conteúdo.

## Experiência escolhida

- Seguir a direção **Two-step configuration drawer**, em fluxo vertical, mantendo a identidade atual: superfícies claras, cinza suave, azul nas ações e texto escuro.
- Tipografia objetiva, com hierarquia inspirada em Sora/Manrope e aderente aos tokens já usados pelo sistema.
- Cabeçalho compacto com o progresso “1 Escopo — 2 Conteúdo”.
- Na segunda etapa, cada canal exibirá seus formatos e controles de quantidade no mesmo bloco, sem uma terceira tela.
- Rodapé fixo com total de peças, voltar e a ação principal; aviso curto informará que a geração continuará após fechar o painel.
- Remover o estado bloqueado mostrado na imagem; o botão X continuará funcional durante a execução.

## Execução em segundo plano

- Reaproveitar `ai_jobs`, o indicador global, as notificações, a trava por cliente/período, a lease com heartbeat e a retomada idempotente já existentes.
- Alterar a ação de geração para devolver rapidamente o identificador do trabalho, enquanto a execução real continua no servidor.
- Persistir no trabalho o destino da pauta e atualizar progresso/etapa conforme a geração avança.
- Preservar o modelo escolhido, briefing, projeto, canais, formatos e quantidades exatamente como enviados.
- Manter limite de uma geração por cliente/período; tentativas repetidas devem reutilizar ou informar o trabalho ativo, nunca criar pautas ou tópicos duplicados.
- Tratar falhas de conexão, limite, recusa e indisponibilidade conforme as regras atuais, encerrando ou pausando sem repetição automática indevida.

## Validação

- Testar voltar/avançar nas duas etapas sem perder escolhas.
- Confirmar canais, formatos e quantidades diferentes, inclusive excedente e ausência de modelo utilizável.
- Iniciar uma geração, fechar pelo X, navegar para outra tela e confirmar que o trabalho continua visível no indicador global.
- Confirmar conclusão com link para a pauta e falha com mensagem em português, sem duplicação ao tentar novamente.
- Verificar desktop e celular, foco por teclado, rolagem interna, rodapé fixo e textos sem sobreposição.
- Executar testes focados e os guardiões obrigatórios do MASTER sem ampliar timeout, pular testes ou mascarar falhas.

## Entrega MASTER-first

- Aplicar código e qualquer ajuste necessário no MASTER, sem alterar RBAC, RLS ou autenticação.
- Regenerar o delta, sincronizar `delta_version.txt` e `MASTER_RELEASE_VERSION`, atualizar a verificação de instalação se houver mudança persistente e rodar `bun run master:check`.
- Não publicar o MASTER nem atualizar instalações sem autorização explícita separada.
