# Correção definitiva dos logins publicados — MASTER e demais instalações

## Objetivo

Recuperar primeiro o login publicado do MASTER e, somente após comprovação real, distribuir a correção às demais instalações sem compartilhar credenciais, repetir etapas concluídas ou alterar RBAC, RLS, usuários e dados de negócio.

## Estado confirmado

- O domínio publicado do MASTER chega ao estado controlado **“Configuração indisponível”** antes de consultar o Supabase.
- A correção 1.4.39 já substitui a leitura dinâmica por referências públicas estáticas, mantém a falha fechada e evita tela branca ou carregamento infinito.
- O pacote MASTER 1.4.39 está sincronizado e o `master:check` passou.
- A navegação local com configuração válida abre o login e redireciona corretamente uma rota protegida.
- A suíte global continua bloqueada antes dos testes porque a credencial atual não reconhece o projeto descartável autorizado.
- O provisionamento já contempla variáveis próprias de navegador e servidor para cada instalação; o incidente atual está no ambiente publicado do MASTER.

## 1. Contenção

- Manter congeladas novas publicações, atualizações e retomadas de instalações enquanto o MASTER publicado não estiver aprovado.
- Preservar checkpoints, tentativas, leases, filas e histórico; não reiniciar operações nem apagar evidências.
- Confirmar por leitura que nenhuma operação de instalação ou atualização ficou executando durante a correção.

## 2. Restaurar a configuração própria do MASTER

- Auditar o vínculo do Supabase externo do MASTER com o ambiente de publicação.
- Restaurar ou revincular, sem registrar valores no código, os pares coerentes de configuração:
  - navegador: URL, identificador do projeto e chave publicável;
  - servidor: URL, identificador do projeto e chave publicável;
  - chave de serviço exclusivamente no servidor.
- Confirmar que todos os identificadores apontam para o projeto Supabase do MASTER.
- Manter proibidos fallback, credencial fixa e herança de credenciais de outra instalação.
- Bloquear a publicação quando qualquer valor obrigatório estiver ausente, vazio, inválido ou apontar para projeto divergente.

## 3. Validar o pacote antes da publicação

Executar os controles obrigatórios:

| Cenário | Resultado esperado |
|---|---|
| Configuração ausente ou ilegível | Erro controlado, sem consulta e sem fallback |
| Valor vazio real | Tratado como ausente, sem tela branca ou carregamento infinito |
| Projetos divergentes | Publicação bloqueada antes do login |
| Configuração válida | Login usa somente o Supabase daquela instalação |

Também:

- Gerar o pacote de produção com a configuração vinculada e inspecionar o artefato sem revelar valores.
- Confirmar a presença das referências públicas esperadas e a ausência da chave de serviço no navegador.
- Reproduzir o incidente publicado e comprovar que ele não ocorre com a configuração correta.
- Rodar testes focados, tipos, qualidade, compilação e `master:check`.
- Reexecutar a suíte global sem ampliar timeout, pular testes ou mascarar falhas. Se a credencial do descartável continuar inválida, manter a publicação bloqueada e corrigir somente o vínculo desse ambiente de teste — nunca usar uma instalação real como substituta.

## 4. Publicar e comprovar o MASTER

Após os controles passarem, solicitar autorização explícita somente para publicar o MASTER 1.4.39.

No domínio publicado, validar em navegação real:

1. `/login` abre sem erro;
2. autenticação real funciona;
3. `/admin/instalacoes` conclui o carregamento;
4. renovação de sessão funciona;
5. logout retorna ao login;
6. não há HTTP 500, erro de configuração ou acesso a outro Supabase;
7. logs e requisições sanitizados confirmam o projeto correto.

Se qualquer item falhar, congelar somente o MASTER, preservar as evidências e impedir a propagação.

## 5. Inventariar as demais instalações sem alterá-las

Para cada instalação, levantar em modo somente leitura:

- versão atual e versão publicada;
- domínio publicado;
- projeto Supabase próprio;
- presença e coerência das configurações de navegador e servidor;
- estado da última operação, checkpoint, tentativa, lease e publicação;
- disponibilidade do login e do portal, quando aplicável.

Classificar cada ambiente como:

- **pronto para atualização**;
- **bloqueado por configuração**;
- **bloqueado por operação ativa ou ambígua**;
- **bloqueado por dependência externa**.

Nenhuma instalação bloqueada entra na onda até sua causa ser resolvida e revalidada individualmente.

## 6. Garantir atualização segura por instalação

- Confirmar que o plano de publicação gera para cada instalação suas próprias configurações e nunca copia as do MASTER.
- Executar preflight de identidade antes de qualquer publicação: domínio, projeto Supabase, identificadores e versão devem coincidir.
- Preservar retomada monotônica por checkpoint: uma atualização interrompida continua do último passo comprovado.
- Não recriar banco, domínio, projeto, publicação ou migration já concluídos.
- Tratar erro, ausência real e resposta válida como estados distintos; respostas ambíguas falham fechadas.
- Aplicar somente o delta acumulado forward-only até 1.4.39, mantendo compatibilidade com versões antigas das instalações.

## 7. Propagar em ondas com autorização separada

Somente depois de o MASTER publicado permanecer aprovado, solicitar uma segunda autorização explícita para atualizar instalações.

Ordem das ondas:

1. ambiente descartável oficial;
2. uma instalação interna controlada;
3. Casa 8;
4. demais instalações em pequenos lotes, agrupadas pela versão de origem.

Para cada instalação:

1. executar o preflight;
2. aplicar o pacote acumulado;
3. publicar usando somente suas próprias configurações;
4. validar login, autenticação, sessão, área interna, portal quando aplicável e logout;
5. registrar versão, pacote, horário e resultado;
6. interromper apenas a instalação que falhar, sem avançar seu lote e sem afetar as já aprovadas.

## 8. Evidências antes de cada liberação

Apresentar uma matriz por ambiente contendo:

- versão de origem e destino;
- identidade do Supabase sanitizada;
- configuração ausente, vazia, divergente e válida;
- reprodução do incidente;
- pacote e SHA;
- totais dos testes;
- resultado dos guardiões;
- estado dos checkpoints;
- validação do login publicado;
- bloqueadores e autorização ainda necessária.

## Critérios de encerramento

O incidente só será encerrado quando:

- o MASTER estiver publicado e o login real aprovado;
- pacote, versão 1.4.39 e verificadores estiverem sincronizados;
- a suíte global tiver passado no descartável autorizado;
- todas as instalações autorizadas tiverem configuração própria coerente;
- cada instalação publicada tiver passado na validação final;
- nenhuma requisição apontar para o Supabase de outro ambiente;
- não houver operação duplicada, reinício de progresso ou perda de checkpoint.

## Fora de escopo e garantias

- Não alterar RBAC, RLS, papéis, usuários, memberships ou dados de negócio.
- Não restaurar fallback para o Supabase do MASTER.
- Não reutilizar credenciais entre instalações.
- Não publicar o MASTER nem atualizar instalações sem duas autorizações explícitas e separadas.
- Não declarar sucesso apenas porque o código compilou; login e sessão publicados precisam ser comprovados.
