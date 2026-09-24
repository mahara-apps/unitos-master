# Plano de correção — inicialização segura do MASTER e das instalações

## Objetivo

Restabelecer o login e as áreas autenticadas sem reintroduzir credenciais fixas ou compartilhadas entre ambientes. A correção nasce no MASTER, é validada antes de publicar e só será propagada após autorizações explícitas separadas.

## 1. Contenção e inventário completo

- Manter instalações clientes e operações de atualização congeladas; não retomar filas, cron ou instalações durante a correção.
- Preservar todos os checkpoints, tentativas e evidências existentes.
- Mapear todas as leituras das variáveis públicas e privadas do Supabase, incluindo login, portal, área autenticada, funções do servidor, publicação e provisionamento.
- Confirmar que nenhuma outra entrada do navegador depende de leitura dinâmica de variável que desapareça no pacote publicado.

## 2. Corrigir a causa no MASTER

- Trocar a leitura dinâmica das variáveis públicas por referências estáticas reconhecidas no empacotamento:
  - `import.meta.env.VITE_SUPABASE_URL`;
  - `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`, com compatibilidade explícita para o nome público legado já aceito.
- Manter as variáveis privadas exclusivamente no servidor e impedir qualquer exposição da chave de serviço.
- Manter a política fail-closed: se a configuração própria estiver ausente ou incoerente, não usar fallback do MASTER nem credencial de outra instalação.
- Evitar que a falha resulte em tela branca ou espera infinita: apresentar estado de configuração indisponível, sem revelar valores, e encerrar o carregamento de forma determinística.

## 3. Guardiões de configuração e publicação

- Fortalecer a validação para exigir os pares de navegador e servidor, além do identificador do mesmo projeto Supabase.
- Validar coerência entre URL pública, URL de servidor e identificador do projeto, sem imprimir chaves.
- Integrar essa verificação ao fluxo de publicação/provisionamento antes de disparar o pacote; configuração ausente ou divergente deve bloquear somente a operação afetada.
- Confirmar que novas instalações continuam recebendo automaticamente suas próprias variáveis e que retomadas preservam etapas já concluídas.

## 4. Testes dedicados ao incidente

Cobrir cada ponto de leitura com os três controles obrigatórios:

1. configuração ausente ou erro de leitura: falha fechada, sem tela branca, sem consulta e sem fallback;
2. valor vazio real: tratado como configuração ausente, sem reinício ou falso sucesso;
3. configuração válida: cliente criado com URL e chave pública da própria instalação.

Adicionar também:

- reprodução exata do pacote publicado atual, em que a leitura dinâmica deixa as variáveis indisponíveis;
- divergência entre projeto do navegador e do servidor;
- garantia de que a chave de serviço nunca entra no pacote do navegador;
- login, portal e área autenticada sem regressão;
- retomada do provisionamento sem repetir checkpoints concluídos.

## 5. Validação equivalente ao uso real

- Gerar um pacote de produção com a configuração do projeto conectada e inspecionar o artefato sem expor valores.
- Executar o fluxo completo em ambiente descartável: abrir `/login`, autenticar, abrir `/admin/instalacoes`, renovar sessão e sair.
- Repetir com configuração ausente para comprovar erro controlado e sem carregamento infinito.
- Rodar testes focados, tipos, qualidade, suíte global sem aumentar timeout ou ignorar falhas, e `bun run master:check`.

## 6. Fechamento MASTER-first

- Aplicar a correção somente no MASTER e registrar o incidente no inventário da versão.
- Regenerar o delta com `build_delta.py`.
- Subir a versão para `1.4.39`, mantendo `delta_version.txt` e `MASTER_RELEASE_VERSION` idênticos.
- Revalidar `verify-installation.sql`; como não há novo objeto de banco previsto, não criar migration artificial. O verificador de ambiente será o guardião desta correção.
- Apresentar evidências: testes por suíte, pacote/versão/SHA, páginas verificadas, estado congelado e qualquer bloqueador.

## 7. Publicação e propagação controladas

- Solicitar autorização explícita para publicar o MASTER.
- Após publicar, auditar diretamente `/login` e `/admin/instalacoes` no domínio publicado e confirmar ausência do erro no navegador.
- Solicitar autorização separada para retomar/atualizar instalações clientes.
- Propagar em ondas: descartável, instalação interna, Casa 8 e demais versões; falha congela apenas o ambiente afetado.
- Não declarar o incidente encerrado até o MASTER publicado e as instalações autorizadas passarem a validação final.

## Fora de escopo

- Não alterar RBAC, RLS, usuários, memberships ou dados de negócio.
- Não restaurar fallback para credenciais do MASTER.
- Não alterar ambientes clientes antes da autorização de propagação.
- Não publicar nem retomar operações nesta etapa de implementação.
