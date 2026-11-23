# Acesso a clientes na Equipe + alinhamento do papel Manager

## Objetivo
Dar acesso a clientes direto na tela de Equipe (ao convidar, vincular, criar ou editar uma pessoa), sem navegar cliente por cliente, e fazer a tela dizer exatamente o que o sistema faz com o papel Manager.

## 1. Papel Manager: fica restrito, os textos passam a dizer a verdade
A regra já definida no sistema é: Manager e User só veem os clientes liberados para eles; Owner/Admin veem o workspace inteiro. O banco já funciona assim — o que está errado são os textos.
- Equipe, Permissões e modal de edição deixam de dizer "administra a marca e todos os clientes".
- Novo texto do Manager: "Gerencia a operação e membros User, apenas nos clientes liberados para ele."
- Na tela Permissões, Manager deixa de aparecer como "administrador do workspace"; o aviso passa a explicar que os módulos são totais, mas só nos clientes liberados.
- Nenhuma permissão muda: ninguém ganha nem perde acesso com essa parte.

## 2. Bloco "Clientes que atende" (reutilizável)
Aparece quando o papel escolhido é Manager ou User (Owner/Admin mostram "Vê todos os clientes do workspace").
Duas opções:
- **Todos os clientes** — libera todos de uma vez.
- **Selecionar clientes** — lista com busca, caixas de marcar, "Marcar todos" / "Limpar" e contador "8 de 27 selecionados".
Regras de hierarquia:
- Owner/Admin: podem liberar qualquer cliente para Manager ou User.
- Manager: só libera para User e só clientes que ele mesmo acessa; "Todos os clientes" para ele significa "todos os que eu acesso".
- Liberar cliente nunca muda papel nem perfil de módulos.

## 3. Onde o bloco entra
- **Adicionar membro > Convidar por e-mail**: depois do papel, pergunta "Quais clientes essa pessoa vai atender?". O acesso é aplicado na hora (conta nova) ou quando o convite é aceito (conta existente).
- **Adicionar membro > Vincular conta**: mesmo bloco, aplicado na hora.
- **Permissões > Adicionar usuário**: já envia clientes por baixo; ganha o mesmo bloco e a opção "Todos".
- **Editar membro**: mostra os clientes atuais marcados; dá para marcar, desmarcar ou trocar para "Todos". Salvar mostra resumo "+3 clientes, −1 cliente".
- Convidar Manager/User sem escolher nenhum cliente mostra aviso: "Essa pessoa não vai ver nenhum cliente até ser liberada."
- Na lista da Equipe, a coluna de acesso mostra "Todos os clientes" ou "N clientes" para Manager/User, e "Nenhum cliente" em destaque quando vazio (caso do André).

## 4. "Todos os clientes" — comportamento com clientes futuros
Depende da sua resposta na pergunta aberta:
- **Incluir os futuros (em uso no plano):** a pessoa recebe a marca "todos os clientes"; todo cliente novo entra automaticamente para ela. Desligar volta para a lista selecionada.
- **Só os de hoje:** marca os clientes atuais um a um; clientes novos são liberados à parte.

## 5. Segurança e auditoria
- Toda liberação/remoção passa por uma única ação no banco que confere a hierarquia (a mesma do "Liberar e atribuir" da 1.4.94).
- Remover um cliente de alguém não apaga tarefas, horas ou histórico; só tira o acesso.
- Cada mudança fica registrada (quem, para quem, quais clientes, quando).

## Detalhes técnicos
- Textos: `ROLE_LABEL`, `ROLE_ACCESS`, `ROLE_SCOPE` em `team-shared.tsx`; `ROLE_CARDS` em `settings.permissions.tsx`; aviso do `member-permissions-modal.tsx`. Teste garante que Manager não é descrito como "todos os clientes".
- Banco (migration):
  - RPC `set_member_clients(_brand_id, _user_id, _mode 'all'|'selected', _client_ids uuid[])` SECURITY DEFINER, transacional, idempotente; valida cada cliente com `can_grant_client_access`; diff em `client_members` (apenas linhas internas, nunca `portal_client`); nunca altera `brand_members.role` nem `access_profile_id`; grava auditoria.
  - `brand_invites.client_ids uuid[]` e `brand_invites.all_clients boolean`; `accept_brand_invite` aplica via a mesma regra.
  - Se "incluir futuros": `brand_members.all_clients boolean default false`; `can_access_client_row` passa a aceitar Manager/User com `all_clients` no mesmo workspace; somente `set_member_clients` grava esse campo (guard de coluna). Se "só os de hoje": esse campo não é criado.
  - `verify-installation-client.sql`: nova checagem (RPC existe, anon sem EXECUTE, colunas novas).
- Servidor: `inviteBrandMembers`, `addExistingUserToBrand`, `addPerson` e `saveTeamMemberFn` aceitam `clientAccess { mode, clientIds }` e chamam a RPC; `listTeamMembers` devolve `clientCount`/`allClients`; nova `listGrantableClientsFn`.
- UI: componente `MemberClientsPicker` usado nos 4 formulários.
- Testes: Manager só libera para User em clientes acessíveis; User não libera; liberar não altera papel/perfil; idempotência; remoção não toca vínculos de portal; convite aplica clientes no aceite; "todos" respeita o escopo de quem libera.
- MASTER-first: delta regenerado, `delta_version.txt` e `MASTER_RELEASE_VERSION` em 1.4.95, `bun run master:check`. Publicação só com sua autorização.
