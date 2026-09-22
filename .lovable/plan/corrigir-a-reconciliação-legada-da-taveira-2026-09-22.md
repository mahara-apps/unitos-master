# Corrigir a reconciliação legada da Taveira

## Objetivo
Eliminar o falso bloqueio sem alterar manualmente a instalação, sem forçar ledger e sem reduzir as proteções da atualização.

## Implementação
- Vincular cada marcador cumulativo legado conhecido ao limite exato de migrations que ele comprovava no momento da aplicação.
- Fazer a inspeção considerar somente posições cobertas por esse marcador histórico; posições posteriores permanecem pendentes e serão executadas normalmente.
- Manter a validação fail-closed para marcador desconhecido, evidência incompleta, estado realmente divergente e checkpoints externos obrigatórios.
- Corrigir a pós-condição da posição 74 para refletir o estado canônico final de `start_job_timer`, sem conceder permissões adicionais.
- Adicionar testes para o cenário real da Taveira 1.3.68 e para impedir promoção indevida de migrations posteriores.

## Fluxo MASTER-first
- Atualizar o código e os testes no MASTER.
- Regenerar o pacote com `build_delta.py`.
- Subir a versão e sincronizar `delta_version.txt` com `MASTER_RELEASE_VERSION`.
- Atualizar a verificação da instalação se o contrato persistido mudar.
- Executar testes focados e `bun run master:check`.
- Publicar somente após nova autorização explícita.

## Limites
- Não editar, cancelar, reabrir, reivindicar ou substituir a operação da Taveira.
- Não escrever no banco da Taveira nem marcar migrations como aplicadas.
- Não alterar RBAC, RLS, autenticação, Apex ou o cron 37.
