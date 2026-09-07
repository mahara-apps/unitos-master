# Onde a Taveira está agora e como voltar ao caminho certo

## Mapa da situação (lido agora no banco do MASTER)

```text
23:24  Atualizar     -> BLOQUEADA: "o MASTER ainda não foi publicado"
23:26  Provisionar   -> reinstalação começou (não era o caminho)
23:47  Cancelar      -> parou dentro da etapa de banco (005_auth_trigger)

Estado atual: status = Falhou | saúde = com falha
Versão instalada: 1.2.9 (commit 4b11ace)   Sistema/MASTER: 1.3.7
```

Verificações de saúde neste momento: **tudo OK** (site no ar HTTP 200, Supabase, storage, cron, chaves, código, workspace) **exceto "banco" marcado como erro** e o aviso já conhecido de "primeiro Super Admin não criado".

## O que isso significa, em palavras simples

- A atualização nunca foi aplicada. Ela foi barrada de propósito, porque o código do MASTER ainda não foi publicado: o pacote publicado está em 1.2.9 e o sistema aqui já está em 1.3.7. Enviar assim repetiria o código antigo.
- O "Provisionar" que você clicou é reinstalação, não atualização. Ele não apaga dados nem troca as chaves da instalação, mas não resolve o que você queria.
- O cancelamento interrompeu essa reinstalação no meio de uma etapa de banco. Por isso o "banco" ficou marcado como erro e o cartão mostra "Falhou". A Taveira continua no ar e atendendo (o site responde normalmente); o que está errado é o **selo de estado**, não necessariamente o ambiente.

## Plano

1. **Rodar "Validar" na Taveira.** É uma checagem somente de leitura. Ela vai dizer, com números, se o banco está íntegro depois do cancelamento. Antes do cancelamento essa mesma validação passou com 30 verificações OK.
   - Se passar: o selo volta para saudável e "Atualização disponível" — nada mais a consertar.
   - Se acusar algo faltando: rodar "Provisionar" de novo e **deixar terminar** até o fim (ele retoma de onde parou e não repete o que já está feito). Só depois disso seguir.

2. **Publicar o MASTER.** É o passo que falta desde 23:24. Sem publicar, qualquer atualização da Taveira continuará bloqueada.

3. **Autorizar a atualização.** Na Taveira, aba **Versões**, botão **Autorizar atualização**. Aí ela recebe a 1.3.7 de verdade.

4. **Conferir o fim.** Esperado: versão instalada 1.3.7, saudável, execução com todas as etapas concluídas, e como único aviso "criar o primeiro Super Admin em /setup".

5. **Evitar o mesmo tropeço na próxima vez** (ajuste pequeno de tela, sem tocar em regra de negócio):
   - "Provisionar" sai do destaque quando a instalação já está no ar: vai para o menu de ações avançadas, com confirmação dizendo em texto claro que é reinstalação.
   - "Autorizar atualização" passa a ser a ação em evidência quando há versão nova.
   - Quando uma operação é interrompida ou bloqueada, o aviso na tela explica o motivo e o próximo passo, em vez de só "Falhou".

## Detalhes técnicos

- `installations` (unitos-taveira): `status=error`, `health=failing`, `health_checks.database=error`, `current_version=pinned_release=1.2.9`, `pinned_commit_sha=4b11ace`.
- Última operação: `provision` `422036ca` -> `failed` / `error_kind=fail`, `FAIL: 005_auth_trigger: Operação cancelada pelo Super Admin.` Anterior: `update` `1752926e` -> `failed` / `error_kind=blocked` comparando `repoRelease` 1.2.9 com `MASTER_RELEASE_VERSION` 1.3.7.
- Reprovisionar é idempotente: `stageProgress` retoma etapas e `ensureInstallationSecrets` reaproveita chaves (nenhum token cifrado é invalidado).
- Passo 1 usa `runAutomatedValidation` (`verify-installation.sql`), que agora não promove versão — apenas recalcula `health`/`status` sobre a release fixada.
- Ajuste de UI restrito a `src/routes/_authenticated/admin.instalacoes.$id.tsx` e ao cartão da lista: hierarquia de ações e leitura de `summary`/`error_kind` da última operação para o aviso. Sem migration, sem mudança de RBAC/RLS. Se esse ajuste entrar, seguir MASTER-first (regenerar delta, sincronizar `delta_version.txt` + `MASTER_RELEASE_VERSION`, `bun run master:check`).
