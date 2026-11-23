# Liberar acesso ao cliente direto ao escolher o responsável

## Situação atual (Casa 8)
Ao escolher um responsável para task/sub-task, o sistema confere se a pessoa enxerga o cliente do projeto. Manager e User só enxergam clientes atribuídos; se não estiver, aparece "Este responsável não tem acesso ao cliente da tarefa." e nada é salvo. Hoje o acesso é dado na edição do membro (Equipe > pessoa > workspaces e clientes), o que obriga a sair da tarefa.

Observação: o acesso no sistema é por **cliente** (cascata cliente → projeto → tarefa). Não existe acesso só a um projeto; liberar o cliente libera os projetos dele, respeitando o perfil de acesso da pessoa.

## O que muda para o usuário
1. Na lista de responsáveis, quem não tem acesso ao cliente aparece com o selo "Sem acesso a este cliente" (não some da lista).
2. Ao escolher essa pessoa:
   - **Se quem está atribuindo pode liberar** (Owner/Admin para qualquer papel; Manager só para Users e só em clientes que ele mesmo acessa): abre uma confirmação curta — "Liberar acesso de Fulano ao cliente Cemice e atribuir?" — com um clique ele ganha acesso ao cliente e vira responsável.
   - **Se não pode liberar** (User, ou Manager tentando liberar outro Manager): botão "Pedir acesso" envia notificação aos Owners/Admins (e ao Manager responsável pelo cliente) com ação "Liberar e atribuir" direto da notificação. A tarefa fica sem responsável até a aprovação; aprovado, atribui automaticamente.
3. Liberar acesso **nunca** muda o papel nem o perfil de módulos da pessoa: um User continua User, com os mesmos limites; ele só passa a ver aquele cliente.
4. Tudo fica registrado em Auditoria (quem liberou, para quem, qual cliente, a partir de qual tarefa).
5. Também vale para criar task/sub-task, troca de responsável em lote e criação por modelo (hoje o modelo deixa "sem atribuição" — passará a oferecer liberar).

## Onde dar acesso a um cliente (resposta à pergunta)
- Continua existindo em Equipe > pessoa > clientes.
- Novo atalho: no cliente (aba Trabalho/Equipe do cliente), lista "Pessoas com acesso" com "Adicionar pessoa", sem sair da tela.

## Detalhes técnicos
- Nova RPC `grant_client_access_and_assign(_client_id, _user_id, _target_type, _target_id)` SECURITY DEFINER, transacional e idempotente: valida o autor via `can_invite_brand_role`/regra hierárquica (Owner/Admin: qualquer; Manager: alvo deve ser `user` e autor com `can_access_client`), insere em `client_members` (ON CONFLICT DO NOTHING), atribui e grava evento de auditoria. Nunca altera `brand_members.role` nem `access_profiles`.
- Tabela `client_access_requests` (pendente/aprovado/recusado) + notificação `kind=system`; RPC de aprovação reutiliza a mesma regra. GRANTs mínimos, anon revogado, RLS por workspace.
- `assertAssigneeEligible` em `src/lib/tasks.functions.ts` passa a devolver erro estruturado `assignee_no_client_access` com `canGrant`, para a tela decidir entre confirmar e pedir.
- Lista de responsáveis traz `hasClientAccess` por pessoa.
- Testes: Manager não libera Manager; User não libera; liberar não muda papel; idempotência; pedido aprovado atribui.
- MASTER-first: build_delta, delta_version/MASTER_RELEASE_VERSION, checagem no verify, `master:check`. Publicação só com sua autorização.
