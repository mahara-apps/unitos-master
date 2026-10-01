# Correção multiplataforma da IA de documentos no MASTER

## Objetivo

Garantir que OpenAI, Claude e Gemini analisem exatamente o mesmo conjunto de campos, usando um contrato compatível com os três provedores, e tornar o Groq o fallback automático e exclusivo de texto em todos os workspaces onde sua chave estiver válida.

## Estado confirmado

- Salvar uma chave Groq hoje apenas marca o provedor como conectado; não preenche `text_fallback_provider`.
- A configuração atual ainda permite escolher Groq como provedor principal e permite outros provedores como fallback.
- A seleção de candidatos pode incluir outros provedores conectados depois do principal/fallback, portanto a cadeia atual não representa “principal + Groq” de forma exclusiva.
- O schema enviado na análise possui 26 campos `nullable`, convertidos em unions no JSON Schema; isso excede o limite observado no Claude.
- Gemini usa chamada por ferramenta, enquanto OpenAI, Claude e Groq usam saída estruturada, mas todos recebem hoje o mesmo schema de transporte incompatível com Claude.
- `invalid_request` é terminal e não troca de provedor; erros transitórios trocam apenas quando o fallback já foi configurado manualmente.

## Implementação

### 1. Regra canônica de provedores

- Restringir o provedor principal de texto a OpenAI, Claude ou Gemini.
- Reservar Groq exclusivamente para fallback; removê-lo da seleção de principal e impedir a combinação inválida também no servidor.
- Ao salvar ou revalidar com sucesso uma chave Groq, gravá-lo imediatamente como fallback do workspace.
- Ao remover ou invalidar a chave Groq, limpar o fallback Groq para não anunciar uma proteção inexistente.
- Exigir um provedor principal válido: um workspace com somente Groq conectado continuará com a chave salva, mas a geração ficará bloqueada com orientação para conectar OpenAI, Claude ou Gemini.
- Migrar os workspaces existentes no pacote MASTER: se Groq estiver conectado e possuir credencial, ele prevalece sobre qualquer fallback atual; se Groq estiver definido como principal, escolher como principal somente um OpenAI/Claude/Gemini já conectado e com credencial. Sem candidato válido, deixar a configuração explicitamente pendente, sem inventar chave ou provedor.
- Manter RBAC/RLS existentes e executar a alteração de configuração pela mesma porta administrativa já autorizada.

### 2. Um contrato de campos, com transporte portátil

- Separar o schema canônico interno do briefing do schema enviado aos provedores.
- Criar um único schema de transporte simples, obrigatório e sem `nullable`/`anyOf`, limites, formatos ou enums frágeis.
- Representar ausência no transporte com valores neutros e inequívocos: texto vazio, listas vazias, booleanos e confiança com sentinela numérica documentada.
- Preservar em todos os provedores os mesmos campos: resumo, tipo de material, texto extraído, 15 campos de briefing, evidências, participantes e confiança.
- Normalizar a resposta em uma única função: converter sentinelas/vazios para `null`, limitar tamanhos e quantidades, validar tipos e então produzir o `BriefingAnalysis` canônico atual.
- Não alterar o schema persistido, o briefing existente, o histórico ou a revisão manual.

### 3. Execução própria por provedor e fallback Groq

- Montar uma requisição nova para cada tentativa, com o mesmo schema de transporte e opções específicas do adapter de OpenAI, Claude, Gemini ou Groq.
- Nunca reutilizar opções do provedor principal ao trocar para Groq.
- Se o principal falhar por indisponibilidade, rate limit, quota, saída ausente/malformada ou incompatibilidade específica do protocolo, executar uma única tentativa no Groq configurado.
- Não usar fallback para entrada inválida localmente, arquivo vazio/corrompido, chave ausente/inválida ou configuração sem provedor principal; esses casos encerram sem gasto duplicado.
- Registrar provider/modelo e causa de cada tentativa, e persistir como efetivo aquele que realmente produzir a proposta.
- Rejeição determinística de schema/contrato não deve repetir três vezes o mesmo provedor; após a única tentativa Groq compatível, encerrar com mensagem em pt-BR.
- Continuar sem Lovable AI/Cloud AI: somente chaves diretas do workspace.

### 4. Melhorias de robustez

- Fazer uma validação local do payload antes da chamada e da resposta antes de gerar propostas.
- Diferenciar na tela: configuração incompleta, arquivo inválido, provedor principal indisponível, fallback indisponível e resposta inválida.
- Preservar checkpoints: uma análise concluída não é paga novamente em retomadas posteriores.
- Garantir que nenhum campo seja aplicado automaticamente; a IA continua produzindo apenas propostas para revisão.
- Manter limite total de tentativas por operação e evitar repetição de falhas permanentes.
- Mostrar na configuração que Groq está ativo como “Fallback automático” e que não pode ser escolhido como principal.

## Migração e compatibilidade

- Criar migration idempotente para normalizar `brand_connections` existentes conforme a regra “Groq prevalece”.
- Não criar tabelas novas. Se houver alteração de constraint, preservar linhas legadas durante a própria migration e manter grants/RLS atuais.
- Atualizar a verificação de instalação para confirmar: principal permitido, Groq como único fallback quando conectado e ausência de Groq como principal.
- A atualização não reprocessará documentos nem modificará briefings; os arquivos falhos poderão ser reanalisados depois, sem novo upload.

## Validação obrigatória

- Testar OpenAI, Claude, Gemini e Groq contra o mesmo fixture de campos e confirmar equivalência após normalização.
- Reproduzir o limite de unions do Claude e comprovar que o novo schema não contém `nullable`/`anyOf` excessivos.
- Testar principal OpenAI/Claude/Gemini com Groq automático, inclusive conexão, reconexão, remoção e chave Groq inválida.
- Testar migração de workspaces com fallback vazio, fallback diferente, Groq como principal, somente Groq e sem Groq.
- Testar falha transitória, saída inválida, incompatibilidade de protocolo, credencial inválida, documento vazio/corrompido e documento válido.
- Reproduzir os três DOCX auditados da Casa 8 até `proposed`, sem aplicar mudanças, confirmando provider/modelo/tentativas e revisão campo a campo.
- Confirmar que uma falha permanente não gera três chamadas iguais e que uma retomada reaproveita checkpoints concluídos.
- Rodar testes focados, TypeScript, lint/build aplicáveis e suíte global sem aumentar timeout, pular testes ou mascarar falhas.

## Sequência MASTER-first

1. Implementar código, migration e testes somente no MASTER.
2. Regenerar o delta com `build_delta.py`.
3. Subir a versão e manter `delta_version.txt` e `MASTER_RELEASE_VERSION` idênticos.
4. Atualizar `verify-installation.sql` para as novas invariantes de configuração.
5. Rodar `bun run master:check` e registrar separadamente qualquer falha ambiental preexistente.
6. Apresentar o resultado para autorização explícita de publicação do MASTER.
7. Após publicação autorizada, atualizar cada instalação somente com autorização separada.
8. Na Casa 8, reanalisar os documentos existentes sem reenviá-los e validar o resultado antes de aplicar qualquer proposta.

## Fora do escopo

- Nenhuma publicação ou atualização de instalação durante a implementação.
- Nenhuma troca automática para Lovable AI, nenhuma alteração de RBAC/RLS/auth e nenhum reparo de briefing já salvo.
- Nenhuma aplicação automática das sugestões extraídas dos documentos.
