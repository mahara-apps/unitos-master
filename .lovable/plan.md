# Correção local do preflight do freeze 1.4.18

## Objetivo

Corrigir somente os bloqueios locais da instalação do freeze, preservando o histórico remoto e todas as proteções fail-closed. Nenhuma ação remota será executada.

## Alterações

1. Criar um preflight read-only específico da instalação do freeze que:
   - trate como bloqueantes somente operações realmente ativas, leases vigentes/ambíguos e tentativas ativas ligadas a operações não terminais;
   - contabilize separadamente tentativas `retryable` históricas ligadas a operações `failed` ou `manual_review`, sem alterá-las;
   - falhe se houver tentativa órfã, status desconhecido, vínculo ambíguo ou estado concorrente.
2. Conectar esse preflight ao modo selado `--install-global-freeze`, antes da transação de instalação.
3. Validar antes do gate e da execução: projeto canônico, formato/host da conexão, autorização específica, confirmação global, operador, justificativa e destino JSONL gravável.
4. Manter a URL e demais segredos fora de mensagens, relatórios e auditoria.
5. Selar o novo preflight no contrato local e documentar o comportamento.
6. Adicionar regressões para histórico terminal permitido, atividade real bloqueada, ambiguidade bloqueada, contexto incompleto, conexão divergente e ausência de vazamento de segredo.

## Validação

- Testes focados do gate, freeze e promoção.
- `bun run master:check` e ensaios locais já integrados.
- Typecheck, lint dos arquivos alterados e build automático.
- Diff e logs finais sem qualquer consulta ou escrita remota.

## Resultado esperado

PASS somente se o instalador continuar usando um único caminho selado, auditável e fail-closed; qualquer contexto ou classificação não comprovável resulta em BLOCK.
