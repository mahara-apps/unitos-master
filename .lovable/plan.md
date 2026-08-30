# Correção definitiva da Importação de Briefing via IA

## Diagnóstico confirmado

A execução mais recente (`feba8a36-8493-4b21-bc96-ee8c6e3547d5`, iniciada em 30/08/2026 às 02:46 UTC) confirma o fluxo real:

- a ingestão terminou corretamente e registrou 65.546 caracteres;
- o Gemini primário (`gemini-flash-latest`) respondeu 503 por alta demanda;
- o fallback Groq (`openai/gpt-oss-20b`) recebeu `reasoning_effort: "none"`;
- esse modelo aceita somente `low`, `medium` ou `high`, portanto o Groq encerrou a chamada com HTTP 400 antes de analisar o conteúdo;
- o erro técnico completo foi persistido no step `interpret`, mas a interface caiu na mensagem genérica “Não foi possível analisar este material”.

Há ainda uma segunda incompatibilidade confirmada no código: as rotas usam `generateText` com `Output.object`, cujo erro é `NoOutputGeneratedError`, mas atualmente verificam apenas `NoObjectGeneratedError`. Isso impede o tratamento e a recuperação corretos quando a saída estruturada falha.

As chamadas não aparecem nos logs do Lovable AI Gateway porque este fluxo usa diretamente os providers BYOK já configurados no workspace.

## Implementação

### 1. Corrigir o contrato do fallback Groq

- Substituir `reasoningEffort: "none"` por `reasoningEffort: "low"` exclusivamente para o Groq/GPT-OSS.
- Manter o limite explícito de saída e structured output suportado pelo modelo.
- Tornar a configuração dependente do provider/model efetivamente selecionado, evitando enviar opções de um modelo para outro.
- Preservar a regra atual: fallback somente para 429/5xx/indisponibilidade; erros 400 permanecem terminais e nunca entram em loop.

### 2. Tornar o schema portátil sem validação frágil

- Remover limites `.max()` do schema enviado ao provider; limites de tamanho permanecerão no prompt e serão aplicados por normalização/clamp após a resposta.
- Manter todas as propriedades obrigatórias e nullable/arrays vazios para compatibilidade com JSON Schema estrito.
- Preservar os campos de briefing, evidências, conflitos, confiança e participantes, sem inventar identidades.

### 3. Corrigir o tratamento de saída do AI SDK

- Tratar `NoOutputGeneratedError`, que é o erro correto de `generateText + Output.object`, nas duas rotas e no salvage.
- Continuar aceitando `NoObjectGeneratedError` apenas como compatibilidade defensiva.
- Recuperar JSON parcial válido quando disponível, normalizar campos omitidos e rejeitar conteúdo truncado ou sentinelas que não sejam JSON.
- Mapear `reasoning_effort` inválido, ausência de saída e truncamento para mensagens específicas, mantendo o erro técnico completo apenas nos logs e steps.

### 4. Preservar o fluxo de produto e segurança

- Não alterar upload, extração DOCX, PDF/imagens, planilhas, texto colado ou detecção de transcrição.
- Manter import run, fingerprint, concorrência, histórico, proposta campo a campo, revisão obrigatória e aplicação idempotente.
- Não alterar banco, migrations, RBAC, RLS, autenticação, tenants/workspaces, instalação ou arquitetura BYOK.

## Validação obrigatória

- Testar a configuração provider-aware: Gemini não recebe opções Groq e GPT-OSS recebe `reasoningEffort: "low"`.
- Cobrir `NoOutputGeneratedError`, `NoObjectGeneratedError`, JSON recuperável, JSON truncado e HTTP 400 terminal.
- Rodar os testes de extração com o DOCX real, import runs, schema, salvage e mensagens da UI.
- Rodar typecheck, suíte completa e confirmar build de produção.
- Usar a sessão já aberta no preview para acionar uma nova tentativa real e consultar a nova run até o estado terminal.
- Considerar concluído somente quando a run atingir `proposed`, com `ingest` e `interpret` concluídos, provider/model efetivos registrados e a revisão campo a campo exibida; se o Gemini responder 503, comprovar que o fallback Groq conclui sem o erro de `reasoning_effort`.
