# Reinstalação limpa da Taveira

## Objetivo
Substituir a Taveira antiga por uma instalação nova, sem histórico técnico ou dados operacionais anteriores, preservando somente o nome, domínio e a identidade institucional.

## Implementação no MASTER
- Criar uma ação específica de **Reinstalação limpa**, separada de “Atualizar” e “Reprovisionar”.
- Exigir confirmação crítica pelo nome da instalação e deixar explícito que usuários e dados operacionais não serão migrados.
- Exigir um **novo projeto Supabase vazio**; bloquear o uso do projeto atual para impedir que dados antigos sobrevivam ao reprovisionamento idempotente.
- Preservar apenas nome, slug/domínio, notas institucionais e os arquivos/configurações institucionais exportados de forma controlada.
- Criar um novo cadastro e provisioná-lo diretamente com a versão MASTER vigente, sem executar reconciliação legada.
- Manter o cadastro antigo até a nova instalação passar em todas as verificações; somente então permitir a troca do domínio e a remoção do cadastro antigo.

## Segurança e validação
- Não copiar usuários, clientes, projetos, tarefas, arquivos operacionais, credenciais ou ledger de migrations.
- Preservar RBAC, RLS e autenticação do pacote canônico atual.
- Validar banco, RLS, autenticação, identidade institucional, publicação e domínio antes da liberação.
- Manter rollback: se a nova instalação falhar, a antiga permanece cadastrada e o domínio não é trocado.

## Fluxo MASTER-first
- Implementar e testar no MASTER.
- Regenerar o pacote e sincronizar a nova versão em todos os artefatos obrigatórios.
- Atualizar a verificação de instalação se necessário e executar `bun run master:check` e a suíte global sem relaxar testes.
- Publicar somente após autorização explícita.
- Executar a reinstalação da Taveira somente depois da publicação e com as credenciais do novo projeto Supabase.

## Dependência externa
Será necessário fornecer ou selecionar um novo projeto Supabase vazio sob a conta autorizada. O MASTER atual não cria nem apaga projetos Supabase externos automaticamente.
