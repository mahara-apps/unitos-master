# Caso Vinicius (Casa 8): Dashboard trava com "Página sem resposta"

## O que já foi confirmado (somente leitura)
- Áudio: ele entra, o Dashboard começa a carregar e o navegador mostra "Página sem resposta"; ao aguardar, volta o aviso.
- Vídeo: aviso do Chrome no Mac, aba "Unitos - Gerenciador de Conteúdos...", tela branca atrás. Isso significa que o navegador ficou travado processando a página, não que a página deu erro.
- Conta na Casa 8 (vinicius.contato.pro@gmail.com): criada em 06/10, e-mail confirmado, login feito hoje às 13:00 (Brasília). Então o login funciona; o travamento é depois.
- Papel: Manager ativo no workspace, sem clientes atribuídos.
- Outras duas pessoas com o mesmo perfil (Manager, sem clientes) entraram na versão atual (1.4.83) ontem e hoje. Os dados dele não têm nada diferente dos colegas.
- Conclusão parcial: ainda não há causa confirmada. Pelos dados, o problema parece ser deste computador ou navegador (extensão, tradução automática, muitas abas, dados antigos salvos). Mas não dá para descartar um travamento do sistema que só aparece em alguma situação específica.

## Passo 1 — Testes rápidos com o Vinicius (sem mexer no sistema)
1. Abrir o Unitos numa janela anônima do Chrome e entrar. Se funcionar, a causa está no navegador: extensão, tradução ou dados salvos.
2. Se funcionar no anônimo: desativar a tradução automática e as extensões, e limpar os dados do site unitos.casa8agencia.com.
3. Testar em outro navegador (Safari).
4. Perguntar às colegas Karynne e Lisy se o Dashboard abre normalmente para elas.

## Passo 2 — Se travar também no anônimo
- Entrar na Casa 8 com a conta dele, com sua autorização, e medir o que trava no Dashboard.
- Para não travar a tela inteira, adicionar uma proteção: cada bloco do Dashboard carrega separado, com limite de tempo. Assim, uma parte lenta não derruba as outras. Ela entra no MASTER seguindo o fluxo completo de versão, e a publicação só acontece com sua autorização.

## Detalhes técnicos
- Consultas feitas em modo somente leitura no banco da Casa 8, usando o acesso guardado no MASTER.
- O aviso "Página sem resposta" indica que o processamento principal do navegador ficou ocupado sem parar. As causas possíveis no código são: renderização em loop, redirecionamento em loop ou um cálculo muito pesado no navegador.
- Pontos a investigar se o problema se reproduzir: o botão de voltar que guarda o histórico de telas, o chip do cronômetro e os avisos de provedores de IA, que entraram nas versões 1.4.81 a 1.4.83 e aparecem no cabeçalho.
