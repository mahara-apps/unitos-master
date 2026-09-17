# Atualização segura de instalações legadas sem manifesto

## Objetivo
Desbloquear atualizações legadas sem reduzir as garantias do pacote canônico, preservando integralmente o fluxo já válido das instalações modernas.

## Implementação
- Corrigir o fluxo de UPDATE para transportar até o executor o manifesto já validado no commit autorizado do MASTER.
- Adicionar uma recuperação determinística usada somente quando o snapshot não trouxer manifesto.
- Aceitar a recuperação apenas quando versão, SHA-256 global, quantidade de 85 blocos, conteúdo SQL e identidade fixada da operação coincidirem exatamente com o contrato Client oficial embarcado no MASTER.
- Gerar o manifesto ausente a partir dos 85 blocos já validados, na ordem canônica e com SHA-256 individual; validar novamente o manifesto gerado antes de aplicar qualquer migration.
- Manter falha fechada para hash divergente, total incompatível, pacote diferente, identidade divergente ou manifesto presente inválido.
- Não alterar checkpoints, ledger, lease, fencing, idempotência, verificadores finais nem o conteúdo do pacote Client.

## Testes
- Instalação moderna com manifesto válido mantém o caminho atual.
- Instalação legada sem manifesto recupera o manifesto canônico correto.
- Manifesto recuperado contém os arquivos, ordem e hashes esperados.
- Hash global divergente e pacote incompatível permanecem bloqueados.
- Reexecução produz o mesmo manifesto e preserva checkpoints/operações concluídas.
- Regressão dos fluxos NEW e UPDATE já aprovados.

## Entrega MASTER-first
- Atualizar a release seguinte ao estado real do repositório e sincronizar `delta_version.txt` com `MASTER_RELEASE_VERSION`.
- Regenerar o pacote determinístico e confirmar 85 blocos Client, SHA canônico inalterado e ausência de SQL Control-plane.
- Executar testes focados, `master:check`, suíte local, typecheck, lint focado e confirmar build OK.
- Comparar explicitamente o comportamento moderno e legado antes/depois.
- Publicar somente após todos os gates passarem; não executar SQL remoto, UPDATE real, retry, NEW nem criar recursos.
- Após confirmação da publicação, orientar apenas a ação oficial manual para testar a atualização de `unitos-teste`.
