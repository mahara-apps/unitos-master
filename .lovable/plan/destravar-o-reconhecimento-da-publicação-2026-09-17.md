# Destravar o reconhecimento da publicação

## Objetivo
Fazer a operação durável já existente reconhecer o deployment **Production / Ready** do commit autorizado e continuar as etapas restantes, sem novo provisionamento, novo recurso ou SQL manual.

## Implementação
1. Confirmar no retorno da Vercel quais campos identificam o deployment pronto do commit esperado e registrar um diagnóstico sanitizado quando nenhum candidato for aceito.
2. Corrigir a busca do deployment para aceitar as representações legítimas de publicação criada pela integração Git, mantendo obrigatórios:
   - projeto Vercel existente;
   - ambiente `production`;
   - SHA completo exatamente igual ao commit autorizado;
   - preferência por `READY` e pelo deployment mais recente;
   - rejeição de tentativas REST bloqueadas ou de commits diferentes.
3. Preservar e reutilizar o checkpoint da operação atual. A retomada deve apenas salvar o identificador encontrado, validar `READY + SHA`, executar os gates seguintes e finalizar normalmente.
4. Cobrir com testes os formatos reais da resposta Vercel, incluindo `source` ausente/alternativo, deployment REST bloqueado concorrente, SHA divergente e retomada sem criação de novo commit ou deployment.

## Contratos e segurança
- Sem bypass de autenticação, RBAC, lease, fencing ou confirmação de Super Admin.
- Sem SQL remoto/manual, NEW, retry, novo repositório, novo projeto Vercel ou alteração no Taveira.
- Nenhum sucesso será aceito apenas pela URL ou pelo estado visual; o SHA autorizado continuará obrigatório.
- A operação existente será retomada pelo executor oficial/cron, não substituída artificialmente.

## Validação e entrega MASTER-first
1. Executar testes focados de publicação, provisionamento, retomada, checkpoints e operação durável.
2. Regenerar o pacote/contratos exigidos pelo MASTER-first e confirmar que o pacote Client continua sem conteúdo Control-plane indevido.
3. Executar `master:check`, typecheck, lint focado, suíte local e confirmar build aprovado.
4. Publicar somente o Master corrigido.
5. Acompanhar a operação existente até ela sair da etapa 08; parar e informar etapa, código e mensagem se surgir uma falha real.
