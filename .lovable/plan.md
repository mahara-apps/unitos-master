# Reconciliar pacote Client e contrato MASTER 1.4.3

## Objetivo
Fechar o release 1.4.3 com o pacote Client canônico de 85 blocos, SHA registrado correto e guardiões alinhados à separação explícita entre Client e Control-plane.

## Implementação
1. Atualizar apenas o SHA em `delta_version.txt`, mantendo a versão 1.4.3 e `MASTER_RELEASE_VERSION` inalterado.
2. Corrigir os sete contratos falhos com base no mapa de destinos:
   - validar objetos Client exclusivamente no pacote Client e em `verify-installation.sql`;
   - validar objetos e migrations Control-plane diretamente nas migrations físicas destinadas ao Master;
   - preservar cobertura dos três fragments Split e das duas migrations Excluded;
   - remover pressupostos legados de que toda migration física pós-corte deve entrar no pacote Client;
   - manter verificações reais de workflow durável, cron, leases e preparação de verificação no domínio correto.
3. Não alterar migrations SQL, mapa, executor, automação, pacote ou manifesto, salvo se o gerador determinístico os regravar sem diferença.

## Validação
- Rodar os testes estruturais do gerador.
- Rodar os guardiões de sincronização, manifesto, SHA, checkpoint e snapshot do pacote.
- Rodar testes de versão, selagem, retomada, UPDATE/retry e separação Client/Master.
- Rodar a suíte de instalação relacionada, `bun run master:check`, typecheck, lint e build pelos comandos do projeto.
- Auditar ao final: 82 Client, 28 Control-plane, 3 Split, 2 Excluded; 85 blocos; SHA `cbcc637fa3ba1312dabffb217c618a5fe6b52ec33f54a5cd4251b8620bdb4978`; nenhuma migration indevida.

## Limites
Nenhum NEW ou retry real; nenhum SQL externo; nenhum acesso a Master/Taveira/ambientes remotos; nenhuma publicação; nenhuma limpeza em clientes existentes.
