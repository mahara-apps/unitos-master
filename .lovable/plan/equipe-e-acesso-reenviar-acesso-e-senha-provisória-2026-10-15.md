# Equipe e acesso: reenviar acesso e senha provisória

## O que muda para o usuário
No menu "..." de cada pessoa em Configurações › Equipe, duas novas opções, visíveis **somente para Super Admin e Admin** (e Owner, que tem autoridade igual ou maior no workspace):

1. **Reenviar acesso por e-mail**
   - Pessoa pendente (nunca entrou): reenvia o convite com novo link de acesso.
   - Pessoa ativa: envia um e-mail de redefinição de senha.
   - Confirmação antes de enviar e aviso de sucesso/erro em português.

2. **Definir senha provisória**
   - Janela para digitar a senha (mínimo 8 caracteres, com botão "Gerar senha" e "Copiar").
   - Ao salvar, a pessoa precisa trocar a senha no próximo login (tela obrigatória de troca já existente no fluxo de primeiro acesso).
   - Opção "Enviar a senha por e-mail para a pessoa" (desmarcada por padrão; a senha nunca fica salva em texto no sistema).
   - Sessões abertas da pessoa são encerradas para que a nova senha valha imediatamente.

## Regras de segurança
- Verificação no servidor, não só na tela: Super Admin em qualquer workspace; Owner/Admin somente para membros do próprio workspace.
- Admin **não pode** alterar senha de Owner nem de Super Admin; ninguém altera a própria senha por aqui (usa o Perfil).
- Manager e User não veem as opções e recebem bloqueio se tentarem chamar diretamente.
- Clientes do Portal ficam fora (já têm fluxo próprio).
- Cada ação é registrada no histórico de ações críticas (quem, para quem, quando) sem guardar a senha.
- Limite de repetição: no máximo 1 reenvio por pessoa a cada 60 segundos.

## Passos
1. Confirmar o comportamento atual: reenvio de convite pendente (já existe para convites), tela obrigatória de troca de senha após `requires_password_change`, e o envio de e-mail usado pelo workspace.
2. Servidor: novas funções `resendMemberAccessFn` e `setTemporaryPasswordFn` com as checagens acima, usando a matriz `workspaceAdminActions` (nova ação `manageMemberAccess`).
3. Tela: itens no menu da pessoa + janela de senha provisória.
4. Garantir que a troca obrigatória de senha bloqueia o uso do sistema até a pessoa definir a nova.
5. Testes: regra de quem pode (Super Admin/Owner/Admin sim; Manager/User não; Admin não altera Owner/Super Admin; não altera a si mesmo) e marcação de troca obrigatória.
6. MASTER-first: se houver migration (apenas se o registro de auditoria exigir), regenerar pacote; subir versão para 1.4.70, `master:check`. Sem publicar nem atualizar instalações.

## Ponto a confirmar
O pedido cita "admin master e admin". Entendi como Super Admin e Admin; incluí Owner porque, pelas regras do sistema, ele tem autoridade maior que Admin no workspace. Se quiser excluir o Owner, ajusto.
