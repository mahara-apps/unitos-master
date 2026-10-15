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
- [x] Fase C — Grupo Produção de conteúdo em Status de trabalho, mesmas etapas canônicas e conclusão por is_terminal; MASTER 1.4.68 selado, 1557/1557 testes locais/runtime, master:check PASS e build OK; nada publicado/atualizado.
- [ ] Fase C — Validação integrada e interação autenticada: bloqueadas por timeout original de 12s do QA e ausência de sessão no Supabase externo; detalhes em docs/PRODUCTION_STATUSES_PHASE_C.md.
- [x] Etapas de conteúdo e status de trabalho: padrão único do workspace, sem exceção por cliente (MASTER 1.4.71, não publicado)
- [ ] Publicar 1.4.71 e atualizar Casa 8 (aguarda autorização); depois aplicar o padrão revisando a prévia dos 5 clientes que eram exceção

## 1.4.74 (não publicado) — pauta em lotes e respostas cortadas
- [x] Pauta mensal gerada em lotes de até 15 peças; nada salvo se um lote falhar.
- [x] Limite de tamanho + detecção de resposta cortada: legendas, estratégia, plano de mídia, agentes, painel.
- [ ] Retomar só o lote que faltou em nova tentativa (hoje a nova tentativa refaz todos os lotes).
- [ ] Estratégia: refazer só a etapa cortada pedindo menos itens.
- [x] Publicação da 1.4.74 solicitada com autorização em 15/10/2026; URL do MASTER respondeu HTTP 200 (não comprova a versão publicada).
- [x] Atualizar Casa 8 para 1.4.74 — operação ed5f67b9-df76-4fbe-9c71-5c8239533877 concluída em 15/10/2026 17:39:23 UTC; publicação Git confirmada e updateValidationPassed=true; cadastro 1.4.74/up_to_date conferido às 17:40 UTC.
- [ ] Repetir a geração das 62 peças e conferir o resultado na Casa 8 — autorizado; atualização confirmada, mas acesso direto à pauta redireciona a /login?next=%2Fmonthly-plan. Supabase externo sem sessão autenticada disponível; nenhuma geração disparada.
