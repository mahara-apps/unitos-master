# Encerrar as pendências do primeiro ciclo Asana

## Resultado esperado

Fechar as Fases 0 e 1 com testes verdes e evidências de acesso correto, sem publicar o MASTER nem atualizar a Casa 8. Só então pedir aceite para iniciar a Fase 2.

## Sequência, sem pular etapas

1. **Reconciliar apenas o banco descartável de testes.** Confirmar no banco QA as assinaturas e os privilégios efetivos das quatro funções apontadas pelos testes. Revogar a permissão de execução de `anon` e de `PUBLIC` nas duas funções de escopo de cliente (`client_in_scope`, `is_client_assigned`) e nas duas funções internas da aprovação pública (`card_approval_public_decide`, `public_surface_rate_hit`), preservando as permissões legítimas de `authenticated` e `service_role`. Verificar de novo os privilégios e testar que a aprovação pública continua funcionando pelo caminho autorizado. Esta intervenção é isolada do MASTER e das instalações; não alterar testes para aceitar o acesso indevido.
2. **Resolver a leitura do teste de workspace.** O teste usa `SUPABASE_SERVICE_ROLE_KEY`, enquanto os demais testes podem usar `UNITOS_TEST_SERVICE_ROLE_KEY`. Diagnosticar a resposta de erro e a origem da chave sem expor valores; alinhar o teste ao mesmo cliente QA validado pelos demais. Confirmar por consulta somente leitura que há no máximo um workspace e que a barreira de criação responde corretamente. Não pular o teste, nem transformar erro de consulta em contagem zero.
3. **Fechar a prova da leitura unificada.** Executar a chamada real autenticada de `listWorkItemsFn`, além dos testes da projeção já existentes; conferir responsável, cliente, workspace, paginação, registros sem prazo e identidade distinta entre Task e Sub-task. Reconciliar os totais com as fontes e registrar qualquer divergência em vez de corrigir dados automaticamente.
4. **Rodar a validação completa.** Repetir a suíte global com as credenciais do QA sem aumentar timeouts ou excluir testes; exigir zero falhas. Revalidar o pacote MASTER (`build_delta.py`, versão e SHA iguais, cobertura da verificação de instalação e `master:check`) e o resultado de compilação. Atualizar o checkpoint com contagens e evidências; aceitar as Fases 0 e 1 somente se tudo estiver verde.

## Limites e próximos passos

- A correção de permissões é **somente no QA descartável**. Qualquer nova alteração propagável ao MASTER segue o processo MASTER-first; nenhuma permissão da produção será alterada por suposição.
- Sem publicação ou atualização de instalações sem autorização explícita. A próxima entrega após o aceite é a Fase 2, “Meu trabalho”; as Fases 7–10 ainda dependem de uma exportação real do Asana.

## Detalhes técnicos

As migrações do MASTER já registram `REVOKE` de `PUBLIC`/`anon` nas quatro funções e permissões específicas para os papéis autorizados. Os testes de segurança exigem erro ao chamá-las como anônimo. O teste de workspace consulta `brands` com chave administrativa lida diretamente de outra variável; essa diferença exige diagnóstico antes de atribuir a falha ao banco ou à regra de negócio. A execução atual documentada no checkpoint é 1879/1882 testes aprovados, com três falhas de segurança no QA.
