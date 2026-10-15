# Fase B — Etapas compartilhadas de produção

## Entrega no MASTER 1.4.67
- Configurações › Regras de produção: nome, cor, ordem, SLA em horas, etapa final, visibilidade no portal e link de aprovação.
- Salvar o padrão não altera quadros existentes. Novos clientes recebem o padrão configurado por trigger transacional.
- Prévia por cliente antes de aplicar: adições, alterações e remoções; peças nas etapas removidas incluem a lixeira para preservar a restauração.
- Apenas o quadro principal é abrangido. Quadros adicionais e regras de aprovação não mudam.
- Quadros existentes começam como exceções para evitar propagação involuntária. A opção de preservar exceções vem ligada.
- Configurar colunas mostra herança e igualdade ao padrão. Alterações locais marcam o quadro como exceção; voltar ao padrão exige aplicação revisada nas Configurações.
- Aplicação exige destino explícito para etapas ocupadas, preserva IDs das etapas renomeadas, rejeita prévia obsoleta e repetições com proposta diferente; resultado e operação são gravados atomicamente.
- Owner/Admin/Super Admin autorizados no servidor e nas RPCs. Manager/User somente consultam o padrão. Tabelas novas com RLS, grants explícitos e anon sem acesso.
- Quatro RPCs administrativas SECURITY DEFINER são intencionais: autoridade e workspace são verificados antes de acessar os dados. Alertas genéricos do linter não significam acesso irrestrito; outros achados antigos ficaram fora deste escopo.

## Evidências
- 1.549/1.549 testes locais/runtime passaram (169 arquivos), incluindo sete testes dedicados e ensaio de SQL em Postgres isolado.
- Ensaio: prévia sem escrita, duas aplicações iniciais, replay sem duplicação, renomeação sem mover peças, exceções, destino obrigatório, preservação de peças ativas e na lixeira, rejeição de concorrência, novo cliente com SLA e bloqueio de Manager/cross-workspace.
- `bun run master:check`: PASS; pacote, bootstrap, recovery e contrato sincronizados.
- Compilação da prévia: OK.
- Suíte global tentada: bloqueada antes dos testes por timeout de 12 segundos na inspeção do QA pela Management API; nenhum timeout alterado e nenhuma falha ignorada.
- Teste de integração real criado, mas não executado porque o QA não respondeu.
- Navegador sem sessão redirecionou para `/login?next=%2Fsettings%2Fproduction-rules`; interação autenticada indisponível neste projeto Supabase externo. A tela autenticada não foi declarada validada ponta a ponta.
- Nada publicado e nenhuma instalação atualizada. Nenhum padrão aplicado a clientes reais durante os testes.

SHA do delta: `c518784f3835e217f93d69b083706a1eb39a938e73a06d7ccfdcc9b1f8864566`.