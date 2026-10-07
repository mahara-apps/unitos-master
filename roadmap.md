# Roadmap — substituição gradual do Asana

- [x] Fase 0: checkpoint, credenciais e permissões do QA descartável reconciliados; suíte global 1882/1882 e master:check passaram. MASTER 1.4.63 não publicado.
- [x] Fase 1: projeção pessoal somente leitura validada com RLS e chamada HTTP real autenticada; Task/Sub-task, paginação e bloqueios de acesso conferidos. Sem alteração de telas.
- [ ] Fases 2–6: experiência diária, atribuição, calendário, colaboração e capacidade — aguardam aceite do primeiro ciclo.
- [ ] Fases 7–10: descoberta, paridade, importação e corte — aguardam exportação real do Asana e autorizações por fase.

## Manutenção segura de IA — somente texto
- [x] Remover geração de imagens, opções e health checks; preservar arquivos, leitura de imagens e embeddings.
- [x] Corrigir leituras ambíguas, catálogo, orçamento fail-closed e consumo confirmado; 55 testes dedicados passaram.
- [x] Registrar matriz de evidências e bloqueios reais em docs/AI_TEXT_MAINTENANCE.md.
- [x] MASTER 1.4.65 selado: master:check PASS; 1540/1540 testes locais/runtime passaram; compilação OK; nenhuma mudança de schema.
- [ ] Suíte global e integração financeira: bloqueadas por timeout de inspeção do QA (sem aumentar timeout ou ignorar testes); dependem da reativação do QA.
- [ ] Validar geração real dos quatro provedores e fluxos completos — depende de QA disponível, chaves válidas e crédito nas contas; sem afirmar 100% antes disso.

## Alertas financeiros de IA
- [x] Fase 1 implementada: crédito insuficiente, bloqueio por workspace/provedor e recuperação explícita por administrador.
- [x] Fase 2 implementada: faixas ajustáveis 80/95/100% do orçamento mensal e notificações transacionais idempotentes; consumo não é saldo do provedor.
- [x] MASTER 1.4.64 selado: delta, bootstrap, recovery e contrato sincronizados; master:check PASS; 1485 testes locais/runtime passaram; build OK.
- [ ] Aceite integrado e suíte global: QA pzkcchtmcqkuhhlsbwxf está INACTIVE; reativação recusada pelo Supabase (limite de projetos gratuitos ativos). Reativar o QA após liberar capacidade ou mudar seu plano, sem pausar/excluir outros projetos automaticamente.
- [ ] Publicação e atualização da Casa 8: aguardam validação integrada e autorização explícita; nenhuma instalação publicada/atualizada.
