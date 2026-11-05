# Caso Vinicius (Casa 8): Dashboard trava com "Página sem resposta"

## O que já foi confirmado
- Áudio e vídeo: depois do login, o Chrome do Mac mostra "Página sem resposta" com a tela branca atrás. Isso quer dizer que o navegador ficou ocupado sem parar; a página não chegou a mostrar um erro.
- No seu print (janela anônima), a tela fica em "Preparando seu espaço..." logo depois de "Bem-vindo de volta".
- Conta na Casa 8: ativa desde 06/10, e-mail confirmado, papel Manager, sem clientes atribuídos. Duas colegas com o mesmo perfil entraram normalmente ontem e hoje.
- Teste que fiz com o acesso enviado, num navegador automático, só olhando, sem salvar nada:
  - o login funcionou e o Dashboard abriu completo em poucos segundos;
  - apareceu o aviso "Complete seu primeiro acesso", com nome e nova senha, por causa da senha provisória;
  - digitar no aviso, recarregar o Dashboard, abrir Equipe e manter 4 abas abertas juntas: em nenhum caso travou (a página respondeu sempre em menos de 10 ms).
- Você confirmou que, no seu computador, a sua própria conta também trava.
- Conclusão: o problema **não é da conta do Vinicius**. Ele aparece no Chrome de verdade, em mais de um computador e com contas diferentes. No navegador automático que eu uso, não acontece. A causa ainda não está confirmada; a suspeita mais forte é algo no carregamento inicial do sistema que só trava num Chrome real.

## O que difere no ambiente dele
- Chrome no Mac com dezenas de abas abertas e extensões.
- A janela anônima compartilha a sessão entre todas as abas anônimas abertas. Se houver mais de uma aba do Unitos, elas podem disputar a mesma sessão.
- O aviso "Preparando seu espaço" infinito é o mesmo que já apareceu antes no preview. Lá, a suspeita era uma espera sem limite de tempo na leitura da sessão.

## Passo 1: capturar o travamento no seu computador (sem mexer no sistema)
1. Testar no Safari, para saber se o problema é só do Chrome.
2. No Chrome, antes de entrar, abrir as Ferramentas do desenvolvedor (Cmd+Option+I) na aba Console e mandar print dos erros em vermelho.
3. Ainda nas Ferramentas, abrir a aba Performance, clicar em gravar e entrar no sistema. Quando travar, parar a gravação e exportar o arquivo. Esse arquivo mostra exatamente qual parte do sistema fica rodando sem parar.
4. Vou repetir o teste num Chrome com aparência de Mac (tela grande e tema escuro) para tentar reproduzir aqui também.

## Passo 2: blindagem no MASTER (vale para todos)
- Pôr um limite de tempo rígido na leitura da sessão ao abrir o sistema. Se estourar, mostrar a opção "Entrar novamente" em vez de girar para sempre.
- Impedir que várias abas abertas fiquem esperando umas pelas outras.
- Seguir o fluxo MASTER-first completo: testes, pacote, versão e verificação. Publicar só com sua autorização.

## Atenção
- A senha provisória foi compartilhada no chat. Depois do teste, peça para ele trocá-la no aviso de primeiro acesso.
