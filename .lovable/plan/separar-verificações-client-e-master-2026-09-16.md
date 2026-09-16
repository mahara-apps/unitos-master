# Separar verificações Client e Master

## Objetivo
Restaurar a verificação Client como SQL read-only válido e criar uma verificação Master independente, derivada exclusivamente das migrations Control-plane e dos contratos existentes.

## Implementação
1. Confirmar pelo mapa e pelos produtores que cada check atual de `verify-installation.sql` pertence ao Client; fechar a CTE e retornar `ord`, `check_name`, `observed` e `status` em ordem determinística.
2. Criar `supabase/install/verify-installation-master.sql`, somente com consultas ao catálogo, cobrindo:
   - as nove tabelas Control-plane e suas colunas críticas;
   - FKs, constraints e índices finais, inclusive `installation_operations_reconcile_idx`;
   - RLS, policies, privilégios efetivos e revogações esperadas;
   - triggers canônicos;
   - as 12 RPCs duráveis pedidas, com assinatura existente, `SECURITY DEFINER`, `search_path` seguro e execução restrita a `service_role`;
   - o cron `installation-provision-resume`, sua agenda, endpoint e uso de `x-cron-secret`.
3. Atualizar os guardiões estruturais para importar os dois verificadores e separar as expectativas Client/Master. A cobertura Client seguirá o pacote e o mapa; a cobertura Master seguirá somente as migrations explicitamente classificadas `control-plane`.
4. Adicionar testes próprios que comprovem SQL read-only, contrato de saída, cobertura integral da família Master, ausência cruzada de objetos exclusivos e detecção estrutural de requisitos omitidos.
5. Registrar esta tarefa no roadmap sem alterar pacote, manifesto, mapa, migrations, versão, SHA, executor ou automação.

## Validação
- Executar testes específicos dos verificadores e os testes de instalação, pacote, checkpoint, versão, selagem e retomada relacionados.
- Executar `bun run master:check`, typecheck e build.
- Confirmar por diff e hashes que pacote, manifesto, versão/SHA e migrations permaneceram inalterados.

## Limites
Nenhum SQL será executado; nenhum banco ou ambiente externo será acessado; nenhum NEW/retry será iniciado; nenhuma publicação será feita. Se um requisito Master não puder ser provado pelos produtores e contratos locais, a implementação será interrompida com a lacuna documentada.
