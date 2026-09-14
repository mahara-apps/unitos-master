# MASTER 1.3.91 — Resiliência comprovada antes da Taveira

## Objetivo
Eliminar o falso cancelamento e demonstrar, com testes comportamentais individuais, os cinco cenários exigidos antes de qualquer nova tentativa na Taveira.

## Implementação
1. Corrigir todas as verificações de status/fencing para distinguir:
   - cancelamento humano real;
   - perda legítima de lease/fencing;
   - leitura indisponível, timeout, 5xx, 429 ou conexão;
   - registro realmente ausente.
2. Em erro de leitura, interromper a fatia com falha transitória classificada e reagendá-la sem consumir tentativa do destino; nunca emitir “Operação cancelada pelo Super Admin”.
3. Preservar o cancelamento humano, lease, fencing, checkpoints e progresso monotônico.
4. Garantir backoff exponencial com jitter nas leituras críticas do cadastro e do cofre.

## Evidências obrigatórias
Executar e apresentar separadamente:
- cofre indisponível, com teste comportamental;
- timeout, 5xx, 429 e conexão, incluindo backoff/jitter;
- `data=null + error`, sem virar “não encontrada”;
- falha do MASTER antes do destino, sem incrementar tentativas;
- reprodução exata do falso cancelamento da 1.3.89, comprovando que a mensagem não aparece mais.

## MASTER-first
- Aplicar eventual mudança de banco no MASTER por migration.
- Regenerar `007_delta_migrations.sql`.
- Subir para 1.3.91 e sincronizar SHA/versão.
- Atualizar a verificação do instalador quando aplicável.
- Rodar testes direcionados, suíte relacionada, `bun run master:check`, conferência de alterações e build automático.
- Não publicar nem iniciar operação na Taveira sem nova autorização explícita.
