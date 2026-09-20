# Habilitação de backup/PITR do Control-plane

## Objetivo e decisão recomendada

Habilitar **PITR com retenção de 7 dias** exclusivamente no projeto Control-plane `tkjbhttylouamqxnbfgv`, sem alterar instalações Client. A escolha oferece restauração para um instante preciso e atende melhor ao risco de migrations, recovery, ledger, permissões e configurações críticas do que apenas um backup diário.

O estado atual continua bloqueado: o inventário oficial retornou zero backups concluídos, PITR desativado e nenhuma janela restaurável.

## Opções oficiais e custos

| Opção | Retenção | Custo oficial indicativo | Adequação |
|---|---:|---:|---|
| Backup diário em plano Pro | 7 dias | Pro a partir de US$ 25/mês, mais compute por projeto | Recuperação diária; insuficiente para mudanças críticas entre backups |
| Backup diário em plano Team | 14 dias | A partir de US$ 599/mês, mais compute | Maior retenção, mas ainda com pontos diários |
| PITR | 7 dias | US$ 0,137/h, aproximadamente US$ 100/mês por projeto | **Recomendado** |
| PITR | 14 dias | US$ 0,274/h, aproximadamente US$ 200/mês por projeto | Opcional se a janela de 7 dias for insuficiente |
| PITR | 28 dias | US$ 0,55/h, aproximadamente US$ 400/mês por projeto | Somente mediante requisito formal de retenção ampliada |

O PITR é cobrado por hora ativada, arredondando frações de hora, e não é coberto pelo Spend Cap. O valor final deve ser confirmado no checkout da organização Supabase antes da contratação. O teste “Restore to a New Project” também cria um projeto temporário com cobrança própria de compute e eventual uso; ele deve ser removido somente após a evidência ser coletada e mediante autorização separada.

## Escopo e retenção

- **Projeto protegido:** somente o Control-plane `tkjbhttylouamqxnbfgv`.
- **Dados cobertos:** banco PostgreSQL, incluindo schemas, dados, índices, roles, permissões, usuários Auth e chave raiz de criptografia suportados pelo restore físico.
- **Fora do backup do banco:** objetos do Storage, configurações de Storage, Edge Functions, chaves/API, configurações Auth/Realtime, extensões/configurações externas e read replicas; manter inventário separado se forem críticos.
- **Retenção inicial:** 7 dias, revisada após 30 dias de operação ou após mudança no RPO/RTO.
- **RPO planejado:** ponto selecionável dentro da janela PITR, com granularidade de segundos conforme o provedor.
- **RTO de aceitação:** medir no primeiro ensaio; não assumir prazo antes da restauração completa.
- **Regra operacional:** antes de qualquer escrita crítica, selecionar e registrar um ponto anterior à mudança dentro da janela restaurável.

## Etapas independentes

### 1. Aprovação comercial — sem alteração técnica

1. Confirmar que a organização Supabase está em plano pago e possui physical backups elegíveis.
2. Aprovar PITR de 7 dias, custo estimado de aproximadamente US$ 100/mês por projeto, além dos custos atuais.
3. Aprovar limite de gasto e responsável financeiro.
4. Confirmar no checkout o preço, impostos e termos vigentes; não contratar se divergirem da aprovação.

**Gate:** autorização comercial explícita. Esta etapa não autoriza ativação.

### 2. Habilitação do PITR no Control-plane

1. Revalidar a identidade exata do projeto.
2. Confirmar que nenhum projeto Client está selecionado.
3. Habilitar somente o add-on PITR de 7 dias no Control-plane.
4. Não executar freeze, migration, recovery, UPDATE, deploy, publicação ou cron.
5. Consultar o inventário oficial até aparecer `pitr_enabled=true` e uma janela física válida.

**Gate:** autorização técnica explícita para habilitar PITR, separada da aprovação comercial.

### 3. Evidência de disponibilidade

Registrar uma evidência estruturada e não secreta contendo:

- provedor e tipo (`supabase_pitr`);
- project ref exato;
- região;
- retenção contratada;
- `pitr_enabled=true`;
- início e fim da janela restaurável em UTC;
- identificador do backup/ponto base retornado pelo provedor, quando disponível;
- horário UTC da consulta;
- operador responsável;
- hash SHA-256 da resposta bruta preservada localmente;
- origem da consulta e status do projeto;
- resultado `available`, sem inferir restaurabilidade apenas de `walg_enabled`.

**Gate:** a janela deve incluir um ponto anterior à futura escrita crítica. Ausência, erro ou campo não verificável mantém `BLOCK`.

### 4. Teste de restauração não produtivo

Usar a opção oficial **Restore to a New Project**, que cria uma cópia de banco independente. Nunca restaurar sobre o Control-plane.

1. Autorizar criação e custo do projeto temporário.
2. Escolher um ponto PITR conhecido dentro da janela.
3. Restaurar para um novo projeto claramente identificado como temporário, sem domínio, cron, integrações, webhooks ou envio de mensagens ativos.
4. Manter o Control-plane em produção intacto durante todo o ensaio.
5. Validar somente no clone:
   - identidade do ponto restaurado;
   - presença e contagem dos schemas/tabelas críticos;
   - ledgers e operações do Installation Manager;
   - funções, ACLs, RLS e constraints críticas;
   - consistência referencial;
   - ausência de execução de jobs e integrações externas.
6. Registrar início/fim, ponto solicitado, identificador do projeto-clone, resultado das verificações, duração observada e hashes do relatório.
7. Autorizar separadamente a exclusão do clone após preservar a evidência.

**Gate:** somente uma restauração completa e validada no clone muda o estado para `RESTORE_VERIFIED`. Falha parcial, timeout ou validação incompleta mantém `BLOCK`.

## Evidência exigida pelo gate Master 1.4.18

O gate atual requer:

- `UNITOS_MASTER_BACKUP_CONFIRMATION=BACKUP_RESTORABLE_VERIFIED`;
- `UNITOS_MASTER_BACKUP_EVIDENCE` com referência ao dossiê estruturado;
- `UNITOS_MASTER_BACKUP_OPERATOR` identificado;
- `UNITOS_MASTER_BACKUP_AUDIT_FILE` persistente;
- execução com `--scope global`.

A referência de evidência deve apontar para um registro imutável contendo disponibilidade PITR **e** teste de restore aprovado. A exceção descartável é proibida para o Control-plane global. A autorização do backup nunca substitui autorizações de freeze, executor, recovery, UPDATE, migration, deploy ou cron.

## Critério final

**PASS** somente quando coexistirem:

1. PITR ativo no projeto exato;
2. retenção e janela restaurável verificadas;
3. restauração concluída em projeto não produtivo;
4. validações de integridade aprovadas;
5. evidência estruturada, selada e registrada pelo operador;
6. gate Master 1.4.18 aprovado em escopo global.

Qualquer item ausente resulta em **BLOCK**.

## Autorizações necessárias, sempre separadas

1. Aprovar custo recorrente e retenção de 7 dias.
2. Autorizar contratação/ativação do PITR apenas no Control-plane.
3. Autorizar criação e custo do projeto temporário de restauração.
4. Autorizar o restore para o novo projeto não produtivo.
5. Autorizar a validação read-only do clone.
6. Autorizar a exclusão do clone depois da preservação das evidências.
7. Confirmar formalmente a evidência no gate global do Master.

Nenhuma dessas autorizações permite freeze, recovery, UPDATE, migration, deploy, publicação, reativação do cron ou alteração da operação Apex; essas ações permanecem bloqueadas e exigem gates próprios posteriores.
