# Plano definitivo — recuperar o MASTER sem quebrar os logins publicados

## Diagnóstico confirmado

- O incidente atual é uma incompatibilidade de publicação: o código novo exige a configuração própria do Supabase, mas o pacote publicado do MASTER foi compilado sem essas variáveis. A proteção bloqueou o acesso em vez de usar outro ambiente; não há evidência de corrupção ou escrita em banco.
- A correção 1.4.39 funciona no preview, mas ainda não foi publicada. Preview e publicação não são equivalentes porque as variáveis públicas são incorporadas durante a compilação.
- O primeiro provisionamento já grava a configuração própria antes do build. A atualização de instalações, porém, aplica banco e publica código sem reaplicar e comprovar essa configuração. Publicar 1.4.39 em massa seria inseguro.
- Estado público observado: MASTER em HTTP 500; Teste novo, Taveira, Apex e Casa 8 em HTTP 200; Teste antigo e NXT em HTTP 404. O painel registra NXT como saudável, portanto seu indicador atual pode estar desatualizado.
- Não há operação de instalação ativa. O congelamento global está desligado, logo a contenção depende hoje apenas de não iniciar novas operações.
- A suíte global está bloqueada porque a credencial não reconhece o Supabase descartável oficial. Esse bloqueio não será ignorado, substituído por instalação real ou mascarado.

## 1. Contenção técnica antes de corrigir

- Congelar no control-plane somente novas instalações, atualizações, retomadas automáticas e novos claims.
- Confirmar por leitura que não restou operação, lease, fila ou executor ativo.
- Preservar integralmente operações, checkpoints, tentativas, erros e histórico.
- Não tocar nos logins publicados das instalações durante esta fase.

## 2. Criar um único contrato de configuração por instalação

Implementar no MASTER uma validação canônica usada por **provisionamento e atualização**, exigindo antes de qualquer mudança:

- URL pública e domínio da própria instalação;
- URL, identificador e chave publicável do mesmo projeto Supabase no navegador;
- URL, identificador, chave publicável e chave de serviço do mesmo projeto no servidor;
- presença das chaves cifradas e coerência dos valores públicos, sem exibir segredos;
- prova de acesso ao Supabase destino e prova de que ele não é o MASTER;
- projeto de hospedagem e repositório pertencentes à instalação correta.

Resultado obrigatório: `APROVADO`, `BLOQUEADO` ou `AMBÍGUO`. Ausência, leitura inválida, timeout, 4xx/5xx ou divergência nunca serão convertidos em aprovação.

## 3. Corrigir o atualizador antes de publicar qualquer instalação

Alterar a ordem da atualização para:

```text
congelamento e lease válidos
→ inventário somente leitura
→ contrato de configuração aprovado
→ gravar/reconciliar variáveis próprias da instalação
→ confirmar a gravação sem revelar segredos
→ aplicar delta forward-only do banco
→ publicar o código autorizado
→ comprovar deployment READY e SHA correto
→ validar login, sessão e banco correto
→ registrar versão
```

Garantias:

- nenhuma migration nem código é aplicado antes da configuração ser aprovada;
- nunca copiar configuração do MASTER ou de outra instalação;
- se a credencial própria não estiver disponível, bloquear antes de tocar no destino;
- a retomada usa o mesmo checkpoint e não repete banco, commit ou deployment concluído;
- checkpoints passam a carregar a identidade sanitizada da configuração e sua impressão digital, nunca os segredos;
- operações antigas sem essa prova não avançam automaticamente: voltam ao preflight;
- HTTP 200 isolado deixa de significar instalação saudável.

## 4. Fechar as lacunas de validação

Adicionar guardiões que reprovem quando:

- a atualização não validar/reconciliar configuração antes do delta e do código;
- faltar qualquer par navegador/servidor ou houver projetos divergentes;
- um deployment responder, mas exibir “Configuração indisponível”, usar SHA incorreto ou acessar outro Supabase;
- a saúde registrada divergir da navegação publicada;
- um retry criar outro efeito para uma etapa já comprovada;
- um ambiente 404/500 for classificado como saudável.

Testes dedicados para cada leitura crítica, usando formatos reais sanitizados:

1. erro/timeout/indisponibilidade;
2. ausência real;
3. resposta válida;
4. reprodução exata do MASTER publicado sem variáveis;
5. replay após commit, perda de resposta e retomada por checkpoint.

## 5. Selar uma nova versão, sem promover a 1.4.39

- Consolidar a correção como uma nova versão do MASTER; 1.4.39 não será distribuída às instalações.
- Regenerar o delta, atualizar `delta_version` e `MASTER_RELEASE_VERSION` com o mesmo número e revisar a verificação de instalação. Não criar migration artificial se nenhum objeto de banco mudar.
- Executar testes focados, tipos, qualidade, compilação e `bun run master:check`.
- Reparar exclusivamente o vínculo do ambiente descartável oficial e executar a suíte global completa, sem aumentar timeout, pular teste ou trocar o destino.
- Manter publicação bloqueada enquanto qualquer guardião ou suíte estiver reprovado.

## 6. Recuperar e comprovar primeiro o MASTER

Antes de publicar:

- restaurar/revincular a integração do Supabase externo do MASTER para que preview e publicação recebam a mesma identidade própria;
- comprovar, sem revelar valores, que navegador e servidor apontam para `tkjbhttylouamqxnbfgv`;
- gerar o pacote de produção e verificar que as referências públicas foram incorporadas estaticamente;
- executar o fluxo completo em ambiente equivalente ao publicado.

Depois das evidências e de **autorização explícita somente para o MASTER**:

- publicar a nova versão;
- validar no domínio real: `/login`, autenticação real, área protegida, `/admin/instalacoes`, renovação de sessão e logout;
- confirmar ausência de HTTP 500, espera infinita, tela de configuração e chamadas a outro Supabase;
- manter todas as instalações congeladas mesmo após o MASTER voltar.

## 7. Inventariar todas as instalações sem alterá-las

Auditar hospedagem, repositório, versão, domínio, identidade do Supabase, presença das variáveis e resposta publicada. Classificar cada uma:

- pronta para atualização;
- bloqueada por configuração;
- bloqueada por 404/500 ou domínio;
- bloqueada por credencial/permissão;
- bloqueada por operação externa;
- ambígua.

Estado inicial já conhecido:

- HTTP 200: Teste novo, Taveira, Apex e Casa 8;
- HTTP 404: Teste antigo e NXT;
- NXT exige correção da divergência entre saúde registrada e URL pública antes de qualquer atualização.

Nenhuma classificação baseada somente no campo “saudável” do painel será aceita.

## 8. Propagar somente com uma segunda autorização

Após o MASTER aprovado, apresentar o inventário e pedir **autorização explícita separada** para instalações. Ordem:

1. descartável oficial;
2. uma instalação interna controlada e comprovadamente configurada;
3. Casa 8;
4. Taveira, Apex e demais instalações em pequenos lotes por versão de origem;
5. ambientes 404/ambíguos somente depois de resolver seu bloqueador, nunca junto com o lote saudável.

Para cada instalação: congelar individualmente, executar preflight, reconciliar sua configuração, aplicar somente o delta acumulado, publicar, autenticar, testar sessão/área interna/portal/logout, auditar o Supabase acessado e registrar versão, SHA, horário e resultado. Uma falha interrompe apenas aquela instalação e o lote atual.

## Evidências exigidas antes de cada autorização

| Ambiente | Origem → destino | Configuração própria | Erro | Ausência | Válida | Reprodução | Retry/checkpoint | Login real | Supabase correto | Resultado |
|---|---|---|---|---|---|---|---|---|---|---|
| MASTER/instalação | versões | identidade sanitizada | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | APROVADO/BLOQUEADO |

Incluir também: pacote e SHA, totais por suíte, resultado do `master:check`, estado do congelamento, operações ativas, bloqueadores e autorização ainda necessária.

## Critérios de encerramento

- MASTER publicado com login e sessão reais aprovados;
- atualização incapaz de publicar código sem antes aprovar a configuração própria;
- suíte global aprovada no descartável oficial;
- todas as instalações autorizadas validadas individualmente no domínio publicado;
- nenhuma chamada a Supabase de outro ambiente;
- nenhum efeito repetido, checkpoint perdido ou operação ambígua promovida;
- congelamento liberado somente após validação final e autorização correspondente.

## Fora de escopo e proibições

- Não alterar RBAC, RLS, papéis, usuários, memberships ou dados de negócio.
- Não restaurar fallback para o Supabase do MASTER.
- Não reutilizar credenciais entre instalações.
- Não apagar evidências nem reiniciar operações do zero.
- Não publicar o MASTER nem atualizar instalações sem as duas autorizações explícitas e separadas.
