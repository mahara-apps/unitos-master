# Plano revisado — autenticação segura em todas as instalações

## Resultado esperado

Corrigir no MASTER e propagar com segurança para todas as instalações:

- instalação inicial protegida, sem corrida para criação do primeiro Super Admin;
- novos usuários entram por convite e definem a própria senha, sem senha temporária por e-mail;
- usuários existentes autenticam a conta correta e aceitam o convite;
- recuperação de senha retorna ao domínio correto e usa o remetente próprio da instalação;
- cadastro público não concede conta utilizável nem acesso a workspace;
- nenhuma instalação usa silenciosamente Supabase, domínio, remetente ou credencial do MASTER;
- atualizações partindo de versões diferentes permanecem idempotentes, retomáveis e isoladas.

A Casa 8 será um caso real de validação, não um hotfix isolado.

## Constatações que orientam o plano

- Hoje `/invite/:token` exige uma sessão e encaminha quem não está autenticado ao login; não oferece primeiro acesso.
- A criação de convite pode pré-criar a conta com senha temporária, e o conteúdo dessa senha depende do e-mail enviado.
- A recuperação usa diretamente o Supabase Auth com `redirectTo` para `/reset-password`; remetente, Site URL e redirects pertencem à configuração Auth de cada projeto Supabase, não à configuração transacional do Resend no Unitos.
- O `handle_new_user` atual pode criar perfil e vincular usuário ao workspace durante a criação da conta.
- `/setup` usa signup público para criar o primeiro Super Admin.
- O cliente do navegador ainda possui fallback compilado para o Supabase do MASTER quando faltam variáveis próprias.
- O atualizador já possui pacote incremental, checkpoints e retomada; a correção deve reutilizar esse mecanismo, sem alterar migrations históricas.

## 1. Inventário e contenção antes da mudança

Executar auditoria somente leitura no MASTER e em todas as instalações registradas, classificando:

- versão, domínio, projeto Supabase e estado operacional;
- Site URL, redirects, signup/confirmação e SMTP do Auth;
- versão efetiva de funções, triggers, RLS e grants de autenticação/convite;
- convites pendentes, expirados, revogados e aceitos;
- contas sem convite, memberships criadas automaticamente, duplicidades e retornos para `localhost`;
- capacidade do control-plane de ler e alterar com segurança a configuração Auth de cada projeto.

Preservar logs e evidências. Nenhuma conta, membership ou convite será removido automaticamente. Ocorrências ambíguas ficam bloqueadas para revisão.

Se houver exploração ativa, a contenção será preparada primeiro no MASTER e só aplicada após autorização: impedir novas memberships sem origem autorizada e bloquear a classificação “saudável” de instalações inseguras.

## 2. Contrato definitivo de identidade e acesso

### Instalação inicial

Substituir a corrida atual de signup público por um bootstrap de uso único, validado no servidor e permitido somente quando a instalação estiver comprovadamente vazia. A conclusão cria o Super Admin e o workspace uma única vez; repetição, concorrência ou tentativa tardia falham fechadas.

Depois do bootstrap:

- signup público fica desativado na configuração Auth;
- criar uma identidade nunca cria acesso por si só;
- o gatilho de usuário cria, no máximo, o perfil mínimo e nunca associa automaticamente ao primeiro workspace;
- membership nasce somente de convite válido, ação administrativa autorizada ou bootstrap inicial protegido.

### RBAC e isolamento

Preservar integralmente a matriz existente: Super Admin não nasce de convite comum; OWNER só segue a autoridade já definida; papéis continuam em `user_roles`/membership canônica; toda concessão é revalidada no servidor e no banco; RLS permanece ativa.

Respostas públicas serão neutras para não revelar existência de conta, convite, papel, senha ou acesso.

## 3. Novo fluxo de convite

### Emissão

- O administrador autorizado cria apenas o convite; não cria uma senha temporária nem envia credenciais.
- O token será forte, armazenado de forma não reutilizável, expirável, revogável e vinculado à instalação, workspace, e-mail, papel e emissor.
- Reenvio rotaciona o token e invalida o anterior.

### Usuário novo

- O link abre uma página pública de primeiro acesso no domínio da própria instalação.
- O servidor valida o convite sem expor se a conta existe.
- Nome e senha são definidos pelo próprio usuário.
- A criação/identificação da conta, concessão da membership e consumo do convite são idempotentes e reconciliáveis.
- O convite só é consumido depois de identidade e membership confirmadas.

### Usuário existente

- O sistema nunca troca sua senha silenciosamente.
- A pessoa entra ou recupera a senha para o mesmo e-mail.
- Depois da sessão confirmada, o convite é revalidado e aceito.
- Sessão de outro e-mail é recusada com mensagem segura.

### Falhas e retomada

Como Auth e banco não compartilham uma transação, usar identidade idempotente da operação e estados monotônicos. Timeout ou resposta ambígua exige reconciliação antes de repetir; replay simultâneo, escrita tardia e consumo duplo são rejeitados. Não criar um segundo motor de atualização paralelo ao já existente.

## 4. Recuperação de senha e e-mail Auth por instalação

Para cada projeto Supabase:

- Site URL = domínio canônico da instalação;
- redirects autorizados limitados às rotas oficiais de autenticação daquela instalação;
- nenhuma URL `localhost` em produção;
- signup público desativado após o bootstrap;
- SMTP do Supabase Auth configurado com a conta/remetente próprios da instalação;
- domínio e remetente verificados;
- templates Auth revisados sem revelar tokens, senhas ou existência da conta.

A configuração transacional do Resend no Unitos e o SMTP do Supabase Auth continuam separados, mas devem pertencer à mesma instalação e serão verificados juntos.

Essas propriedades não serão tratadas como SQL. O control-plane usará a API administrativa apropriada do Supabase; ausência de credencial ou resposta inconclusiva deixa a instalação **bloqueada por configuração**, nunca aprovada por suposição.

## 5. Falha fechada contra cruzamento entre instalações

Remover o fallback do cliente para o Supabase do MASTER. Uma publicação sem URL/chave publicável próprias não inicia o acesso e mostra indisponibilidade segura.

Adicionar preflight e verificação pós-atualização para garantir:

- projeto Supabase e domínio pertencem à instalação esperada;
- Site URL, redirects e SMTP não apontam para MASTER ou outra instalação;
- código publicado usa as variáveis do destino;
- convite e recuperação geram links apenas da origem canônica;
- nenhuma chave privada chega ao navegador, resposta, relatório ou log.

## 6. Migração compatível e forward-only

Criar somente migrations novas, cumulativas e idempotentes sobre a versão selada atual. Não editar nem depender da reexecução de migrations históricas.

A migração deverá:

- substituir com segurança o comportamento de `handle_new_user`;
- manter criação de perfil sem membership automática;
- endurecer grants, RLS e funções de convite/primeiro acesso;
- adicionar apenas o estado mínimo necessário à idempotência e auditoria;
- preservar usuários, papéis, memberships e convites existentes;
- ter pós-condições verificáveis e reaplicação segura.

Convites legados serão classificados durante o preflight:

- aceitos/revogados/expirados: preservados, sem reabertura;
- pendentes seguros: rotacionados e reenviados no novo formato somente por ação autorizada;
- ambíguos: bloqueados para revisão, sem conversão silenciosa.

## 7. Automação de atualização para todos os ambientes

Estender o fluxo existente do control-plane, preservando lease, fencing, checkpoints e retomada:

1. inventário e preflight somente leitura;
2. snapshot/backup aplicável e registro da versão de origem;
3. publicação do código da release aprovada;
4. aplicação incremental do delta no destino;
5. configuração Auth pela API administrativa;
6. verificação estrutural, de configuração e isolamento;
7. testes controlados de convite e recuperação;
8. liberação somente com todas as evidências confirmadas.

Uma etapa só vira checkpoint concluído após sua pós-condição. “Tentar novamente” retoma do último checkpoint selado; não recria projeto, usuário, convite ou deployment já confirmado. Falha em uma instalação interrompe somente ela.

Instalações sem acesso administrativo, SMTP válido, domínio verificado ou backup possível ficam em estado explícito de bloqueio e não impedem as demais.

## 8. Verificadores e critérios técnicos

Atualizar `verify-installation-client.sql` e os verificadores do control-plane para comprovar, entre outros:

- gatilho não cria membership automática;
- funções sensíveis são `SECURITY DEFINER` somente quando necessário, com `search_path`, grants mínimos e sem execução anônima indevida;
- aceite exige convite válido, e-mail compatível, autoridade vigente e consumo único;
- signup público está desativado após setup;
- Site URL/redirects/SMTP são próprios;
- não há referência ao MASTER;
- instalação vazia ainda consegue concluir o bootstrap protegido;
- instalação já inicializada não consegue repetir o bootstrap.

Leituras críticas devem distinguir resposta válida, ausência real e erro/timeout; estado desconhecido nunca equivale a PASS.

## 9. Testes obrigatórios antes de publicar

Cobrir pelo menos:

- instalação nova e bootstrap concorrente;
- signup direto pela API antes e depois do setup;
- usuário novo, usuário existente e conta sem senha conhecida;
- sessão com e-mail diferente;
- convite expirado, revogado, aceito e replay simultâneo;
- falha após criar identidade, após membership e antes da resposta;
- reenvio e rotação de token;
- recuperação com redirect correto, incorreto e ausente;
- SMTP válido, inválido e indisponível;
- domínio pendente;
- isolamento entre duas instalações e ausência de fallback ao MASTER;
- enumeração, rate limit, RBAC/RLS e ausência de segredos em logs;
- atualização limpa, versão atual, `1.4.28` e outras versões realmente encontradas no inventário;
- tentativa interrompida retomando sem repetir checkpoints.

Usar retornos reais conhecidos do Supabase Auth/Resend nos fixtures. Rodar testes focados, integração em ambiente descartável, suíte global, typecheck, lint e build sem ampliar timeout, pular testes ou mascarar falhas.

## 10. Fechamento MASTER-first

Sequência obrigatória:

1. implementar código e migrations no MASTER;
2. atualizar `verify-installation-client.sql` e contratos afetados;
3. regenerar o delta com `build_delta.py`;
4. sincronizar SHA/versão em `delta_version.txt` e `MASTER_RELEASE_VERSION`;
5. regenerar artefatos do control-plane quando afetados;
6. executar `bun run master:check` e todas as validações;
7. apresentar relatório com versão, SHA, migrations, testes, matriz de upgrades e pendências;
8. publicar o MASTER somente após autorização explícita.

Versões intermediárias ainda não publicadas serão absorvidas pela nova release cumulativa; não serão publicadas separadamente apenas para depois atualizar novamente.

## 11. Propagação em ondas, com autorização

Após o MASTER publicado:

1. ambiente descartável equivalente;
2. instalação interna não crítica;
3. Casa 8;
4. pequeno grupo representando versões distintas;
5. demais instalações em lotes;
6. instalações divergentes/bloqueadas tratadas individualmente.

Antes de cada onda, apresentar a lista de destinos e pedir autorização. Para cada instalação registrar versão anterior/nova, checkpoints, configuração Auth, resultado do convite, recuperação e auditoria de memberships.

O incidente só será encerrado quando todas as instalações elegíveis estiverem atualizadas e funcionais, e cada exceção restante tiver responsável, motivo e próximo passo explícitos.

## Fora de escopo

- apagar automaticamente usuários ou memberships suspeitos;
- reutilizar credenciais entre instalações;
- alterar a matriz de papéis;
- publicar o MASTER ou atualizar qualquer instalação sem autorização explícita.
