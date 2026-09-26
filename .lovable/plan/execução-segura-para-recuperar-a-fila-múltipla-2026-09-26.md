# Execução segura para recuperar a fila múltipla

## Objetivo

Destravar a remessa existente sem recriá-la, sem repetir a atualização concluída na NXT e sem alterar RBAC, RLS, autenticação ou dados de negócio. A fila continuará estritamente sequencial:

```text
NXT reconciliada → Casa 8 → Apex → Taveira → unitos-new-teste-02
```

## Estado de partida confirmado

- O MASTER 1.4.44 foi publicado, mas publicar o site não instalou o contrato Master-only no Control-plane.
- O Control-plane permanece registrado em 1.4.20 e ainda usa o finalizador incompatível com o fingerprint operacional do ledger.
- A NXT concluiu cinco etapas e 93 migrations da remessa 1.4.43, porém ainda não possui `reconciled_at` nem os selos de release/commit da remessa.
- As outras quatro operações continuam `pending`, sem tentativas, leases ou migrations executadas.
- A fila está preservada e bloqueada pelo gate sequencial correto; não se deve cancelar, recriar ou clicar em “Tentar novamente”.

## Fase 1 — Corrigir e selar o executor operacional no MASTER

1. Remover do comando de promoção a versão histórica fixa 1.4.30 e vinculá-lo à versão canônica selada do contrato atual.
2. Tornar a autorização de promoção específica para essa mesma versão, impedindo promoção com versão, commit ou hash divergentes.
3. Adicionar testes que reprovem qualquer versão fixa antiga no comando e comprovem a promoção da versão declarada no contrato.
4. Selar a correção como uma nova versão do MASTER, prevista como **1.4.45**:
   - regenerar o delta;
   - sincronizar `delta_version.txt` e `MASTER_RELEASE_VERSION`;
   - regenerar bootstrap e contrato do Control-plane;
   - atualizar os verificadores afetados;
   - executar testes focados, ensaio PostgreSQL, checagem de tipos e `bun run master:check`.
5. Executar a suíte global sem aumentar timeout, pular testes ou mascarar falhas. Se o token continuar inválido, registrar esse bloqueio sem convertê-lo em aprovação.

**Saída exigida:** versão, SHA do pacote, hash do contrato, totais dos testes e matriz de evidências. Nenhuma escrita remota nesta fase.

## Fase 2 — Publicar o MASTER corrigido

1. Solicitar autorização explícita para publicar a nova versão.
2. Publicar o MASTER e confirmar que o site serve a versão selada.
3. Repetir a auditoria somente leitura da remessa para garantir que NXT e as quatro pendentes não mudaram durante a publicação.

**Parada obrigatória:** publicação não autoriza instalação do contrato nem retomada da fila.

## Fase 3 — Instalar e promover o contrato no Control-plane

Esta fase exige autorização explícita separada e evidência de backup restaurável ou aceitação formal do risco já prevista no gate.

1. Registrar snapshot sanitizado da remessa, operações, tentativas, leases, ledger, selos e estado do Control-plane.
2. Ativar o freeze global pelo comando canônico e confirmar por leitura:
   - freeze ativo e geração esperada;
   - nenhuma operação `running` ou `retryable`;
   - nenhuma tentativa ativa;
   - nenhuma lease válida;
   - as quatro sucessoras ainda `pending` e intocadas.
3. Executar o preflight oficial do executor e exigir **11/11 PASS**.
4. Instalar exclusivamente o finalizador determinístico corrigido. Não instalar migrations Client nem alterar operações.
5. Rodar `verify-installation-master.sql` e exigir PASS integral, inclusive:
   - fingerprint operacional aceito;
   - SHA-256 do pacote mantido em `baseline_hash`;
   - fencing e lease preservados;
   - finalização e pins atômicos;
   - gate sequencial dependente de reconciliação.
6. Promover atomicamente o estado do Control-plane para a versão selada, conferindo geração, commit e hash do contrato.
7. Manter o freeze ativo após a promoção.

**Rollback:** qualquer divergência aborta a transação ou mantém o freeze; nenhuma operação da fila é alterada.

## Fase 4 — Reconciliar somente a NXT

Esta fase exige autorização explícita própria para o reparo transacional.

1. Executar o reparo canônico informando exatamente:
   - operação da NXT `9d938a39-f661-4561-9bb0-21828ae883ac`;
   - remessa `261f5362-5afd-4856-b9d3-80d88362cf7f`;
   - destino `1.4.43`;
   - commit `fb3f3b12d55ed79a268a34edc451c70fc9809785`;
   - SHA do pacote `f6e8e0bea23c80e93bdc52b4245fcafa1ff3a94e0d76ae2a83c90a2a5601f18b`;
   - total de 93 migrations.
2. O reparo deve falhar fechado se não comprovar: cinco etapas concluídas, posições 1–93 contíguas, statements completos, release/commit/pacote idênticos, flags finais verdadeiras e ausência de lease/tentativa ativa.
3. Confirmar por leitura que:
   - NXT continua `success` e `current_version=1.4.43`;
   - `reconciled_at` foi preenchido;
   - `pinned_release=1.4.43` e o commit fixado corresponde à remessa;
   - nenhuma migration, tentativa, deploy ou operação foi repetida;
   - Casa 8 e as demais continuam `pending` e sem tentativa.
4. Rodar novamente o verificador completo ainda sob freeze.

**Rollback:** não há correção parcial; a transação inteira aborta diante de qualquer evidência divergente.

## Fase 5 — Liberar e acompanhar a fila

Esta fase exige autorização explícita para retirar o freeze e permitir a retomada automática.

1. Desativar o freeze pelo comando canônico, usando a geração confirmada após o reparo.
2. Não fazer claim manual e não alterar status diretamente; deixar o cron assumir a Casa 8 pelo fluxo normal.
3. Acompanhar cada instalação até a confirmação completa antes de aceitar a próxima:
   - claim único e fencing incrementado;
   - migrations/checkpoints monotônicos;
   - publicação do código confirmada;
   - validação final aprovada;
   - operação `success` com `reconciled_at`;
   - `pinned_release` e `pinned_commit_sha` iguais ao baseline da remessa;
   - ausência de tentativa ou lease residual.
4. Ordem obrigatória: Casa 8, Apex, Taveira e unitos-new-teste-02.
5. Se houver falha, timeout ambíguo, perda de lease ou bloqueio, congelar novamente o Control-plane e manter todas as sucessoras pendentes. Não reiniciar do zero nem consumir tentativa por falha anterior ao acesso ao destino.

## Fase 6 — Auditoria de encerramento

1. Auditar diretamente as cinco instalações e confirmar versão, migrations, saúde, pins, ledger e ausência de duplicação.
2. Confirmar no Control-plane:
   - cinco operações `success` e reconciliadas;
   - nenhuma operação/tentativa/lease ativa da remessa;
   - posições e total da remessa preservados;
   - cron saudável;
   - freeze desligado somente após o encerramento.
3. Registrar separadamente qualquer instalação que falhar; a remessa não será declarada concluída enquanto houver item pendente, bloqueado ou ambíguo.

## Autorizações independentes

A aprovação deste plano autoriza apenas a **Fase 1**, que altera e valida o código local do MASTER. Depois serão solicitadas separadamente:

1. publicação da nova versão do MASTER;
2. freeze, instalação e promoção do contrato do Control-plane;
3. reparo transacional da NXT;
4. retirada do freeze e retomada da fila.

Nenhuma dessas autorizações será inferida da anterior.
