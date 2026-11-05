# Caso Vinicius (Casa 8): Dashboard trava com "Página sem resposta"

## O que já foi confirmado
- Áudio e vídeo: depois do login, o Chrome do Mac mostra "Página sem resposta" com a tela branca atrás. Isso quer dizer que o navegador ficou ocupado sem parar; a página não chegou a mostrar um erro.
- No seu print (janela anônima), a tela fica em "Preparando seu espaço..." logo depois de "Bem-vindo de volta".
- Conta na Casa 8: ativa desde 06/10, e-mail confirmado, papel Manager, sem clientes atribuídos. Duas colegas com o mesmo perfil entraram normalmente ontem e hoje.
- Teste que fiz com o acesso enviado, num navegador automático, só olhando, sem salvar nada:
  - o login funcionou e o Dashboard abriu completo em poucos segundos;
  - apareceu o aviso "Complete seu primeiro acesso", com nome e nova senha, por causa da senha provisória;
  - digitar no aviso, recarregar o Dashboard, abrir Equipe e manter 4 abas abertas juntas: em nenhum caso travou (a página respondeu sempre em menos de 10 ms).
- Conclusão: o travamento **não se reproduz fora do computador dele**. A conta e os dados estão corretos. A causa ainda não está confirmada.

## O que difere no ambiente dele
- Chrome no Mac com dezenas de abas abertas e extensões.
- A janela anônima compartilha a sessão entre todas as abas anônimas abertas. Se houver mais de uma aba do Unitos, elas podem disputar a mesma sessão.
- O aviso "Preparando seu espaço" infinito é o mesmo que já apareceu antes no preview. Lá, a suspeita era uma espera sem limite de tempo na leitura da sessão.

## Passo 1: testes com ele (sem mexer no sistema)
1. Fechar todas as janelas anônimas, abrir uma única janela nova e só uma aba do Unitos.
2. Testar no Safari.
3. Se travar, abrir as Ferramentas do desenvolvedor (Cmd+Option+I), aba Console, e mandar print dos erros em vermelho.

## Passo 2: blindagem no MASTER (vale para todos)
- Pôr um limite de tempo rígido na leitura da sessão ao abrir o sistema. Se estourar, mostrar a opção "Entrar novamente" em vez de girar para sempre.
- Impedir que várias abas abertas fiquem esperando umas pelas outras.
- Seguir o fluxo MASTER-first completo: testes, pacote, versão e verificação. Publicar só com sua autorização.

## Atenção
- A senha provisória foi compartilhada no chat. Depois do teste, peça para ele trocá-la no aviso de primeiro acesso.
