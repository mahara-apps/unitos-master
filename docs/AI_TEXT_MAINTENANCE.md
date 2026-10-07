# Manutenção segura de IA — MASTER 1.4.65

## Escopo
Somente geração de texto. Removidos geração de imagem, ação de referência visual, seleção e catálogo de modelos de imagem. Arquivos existentes, leitura de documentos/imagens e embeddings preservados; nenhuma coluna ou dado legado foi excluído. Não há alteração de schema neste ciclo: delta financeiro 1.4.64 preservado e verificação Client 89–90 permanece aplicável.

## Proteções implementadas
- Listagem inválida/ilegível não confirma chave; lista vazia confirmada é distinta de erro.
- Catálogo falha explicitamente em erro de leitura/gravação; overrides legados de imagem não são usados.
- Limite mensal deve ser confirmado antes de cada chamada real, incluindo retry e embeddings; falha de RPC não libera gasto.
- Sucesso de texto/stream aguarda registro de consumo; falha de registro não dispara fallback pago.
- Embeddings registram uso e preço específico. Quando API omite tokens, estimativa de caracteres/4; consumo permanece estimado, nunca saldo real.
- Health check de texto tem timeout, zero retry SDK e exige resposta não vazia; mede consumo, respeita limites e não declara saúde se a verificação da chave ficou inconclusiva.
- Falha de listagem de sucessores fica explícita; crédito insuficiente no sucessor é capturado.
- Heartbeat de importação e Copilot registra falha; claim incerto nunca escreve estado de job sem possuir lease.
- Bloqueios financeiros, RLS, autoridade administrativa, idioma pt-BR e fencing preservados.

## Evidência e aceite
| Provedor | Testes simulados de contrato e erro | Geração real neste ciclo | Bloqueio conhecido |
|---|---|---|---|
| OpenAI | Passaram | Não executada | Sem evidência recente de geração real |
| Anthropic | Passaram | Não executada | Casa 8 anteriormente sem créditos; não reconfirmado |
| Gemini | Passaram | Não executada | Sucessos históricos não comprovam este ciclo |
| Groq (fallback) | Passaram | Não executada | Verificações históricas rejeitaram credencial; não reconfirmado |

Testes locais/runtime: 1540/1540 passaram (167 arquivos), incluindo os 55 novos testes de resiliência. MASTER 1.4.65: master:check PASS, versão sincronizada; delta sem mudança de SHA d8b5bb1f53b9b4fa8d9638acf3889353cb1899e9fd335ac2f5d52718ca1714ec. Preview compilou sem erros.

Suíte global reexecutada: falhou antes de executar testes, na inspeção do schema do QA pela Management API (timeout original 12s). Nenhum timeout alterado e nenhuma falha ignorada. QA havia sido confirmado INACTIVE/PAUSED; reativação exige capacidade/planos externos. Testes de integração financeira e ponta a ponta de briefing, documentos, estratégia, pauta, peças, Copilot e Brain permanecem pendentes desse bloqueio e de credenciais/crédito válidos. Não há aceite de 100% funcional.

Nada publicado nem propagado para Casa 8; autorização de publicação permanece separada.