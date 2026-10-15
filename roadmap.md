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

## Padrão do workspace para produção de conteúdo
- [x] Fase A — Regras de produção padrão (Configurações › Regras de produção) com exceção por cliente (MASTER 1.4.66)
- [x] Fase B — Etapas compartilhadas, prévia por cliente, exceções e aplicação transacional no MASTER 1.4.67; 1549/1549 testes locais/runtime e master:check PASS; nada publicado/atualizado.
- [ ] Fase B — Validação integrada e interação autenticada: QA sem resposta (timeout original de 12s); sessão autenticada indisponível no Supabase externo. Evidências em docs/PRODUCTION_STAGES_PHASE_B.md.
- [ ] Fase C — Criar grupo de produção de conteúdo em Status de trabalho, ligado às etapas canônicas; testar e selar MASTER sem publicar/atualizar instalações.
