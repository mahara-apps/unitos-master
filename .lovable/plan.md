# Estabilizar credenciais e provisionamento das instalações

## Objetivo
Eliminar os bloqueios falsos e impedir que uma operação comece sem provar, naquele momento, que o banco e os acessos da instalação estão utilizáveis.

## Correção
1. **Leitura confiável do cofre**
   - Depois de validar o Super Admin, todas as operações usam a leitura protegida do servidor para buscar credenciais.
   - Falha ao consultar o cofre, token realmente ausente e token ilegível deixam de ser tratados como o mesmo erro.
   - A leitura terá uma repetição curta para falhas transitórias; erro persistente interrompe com diagnóstico real.

2. **Pré-validação obrigatória**
   - Provisionar, atualizar, validar, retomar e reiniciar só avançam depois de confirmar que o token abre o projeto Supabase correto e que as chaves necessárias podem ser lidas.
   - Nenhuma operação será criada ou marcada como falha quando o problema já puder ser detectado antes dela.

3. **Diagnóstico operacional**
   - O cartão de acessos distinguirá “configurado e legível”, “gravado, mas ilegível” e “ausente”.
   - “Testar acesso” verificará cada serviço de forma independente; um problema no Supabase não esconderá o estado de GitHub ou hospedagem.
   - Mensagens indicarão a ação exata, sem chamar falha de banco de token ausente.

4. **Recuperação do Apex**
   - Revalidar o token já guardado do Apex pelo mesmo caminho usado pela automação.
   - Se continuar legível, liberar nova tentativa sem pedir o token novamente; se o serviço externo o revogou, pedir substituição somente nesse caso.

5. **Padrão replicável e MASTER-first**
   - Cobrir criação, edição, retomada, falha transitória, token ausente, ilegível e revogado com testes.
   - Atualizar a versão do MASTER, regenerar o pacote, sincronizar a versão e executar a verificação completa.
   - Não publicar nem propagar sem autorização explícita.

## Segurança preservada
- Tokens continuam cifrados, nunca retornam à tela e nunca entram em logs.
- Nenhuma alteração em RBAC, RLS, papéis ou permissões.
- Nenhum fallback para o token central em instalações BYOK.
