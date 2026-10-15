# Etapas de conteúdo: um único padrão para todos os clientes

## Por que a alteração não apareceu na Casa 8 (diagnóstico a confirmar)
Pelos prints, o padrão foi salvo ("Padrão configurado"), mas o Kanban de Conteúdo ainda mostra as colunas antigas (Ideia, Design, Revisão) misturadas com uma coluna de outro cliente (Copy). Causas prováveis, a confirmar só com leitura na Casa 8 antes de qualquer correção:
1. O botão "Salvar e aplicar aos clientes" ainda não chegou à Casa 8 (está só no MASTER, sem publicação). Lá o salvar grava só o padrão para clientes novos.
2. Clientes marcados como exceção não recebem a mudança.
3. O Kanban geral junta colunas pelo nome de cada quadro, então quadros diferentes geram colunas duplicadas ou misturadas (o "Copy" à parte).

## Sua proposta: um padrão só, sempre para todos
Concordo. Com exceções, o Kanban geral, o calendário e os relatórios mostram nomes e ordens diferentes, e o conflito visual é inevitável. A regra nova fica:
- **Etapas de conteúdo são do workspace.** Toda alteração vale na hora para todos os clientes, sem exceção.
- A opção "exceção deste cliente" nas etapas some. Regras de aprovação e limite (Fase A) continuam aceitando exceção, porque não mexem nas colunas.
- Na ficha do cliente, as etapas aparecem só para consulta, com o aviso "Definido pelo workspace em Status de trabalho".

## Como fica o salvar
1. Você edita e clica em **Salvar e aplicar a todos**.
2. Abre um resumo: quantos clientes mudam, quais eram exceção e voltam ao padrão, e as colunas renomeadas, reordenadas, novas e removidas.
3. **Coluna removida com peças:** você escolhe para qual etapa elas vão. Sem essa escolha, não salva.
4. Ao confirmar, tudo é aplicado de uma vez. Se algo falhar, nada muda.
5. O Kanban, o calendário e as listas recarregam com os nomes e a ordem novos.

## Primeira unificação (quadros que já existem hoje)
- Cada etapa antiga de cada cliente é ligada a uma etapa do padrão. Primeiro pela chave interna, depois pelo nome. O que sobrar, você liga numa tela de "de → para" antes de confirmar.
- Peças, aprovações, comentários, histórico e datas são mantidos. Só muda a etapa em que a peça está, quando a etapa antiga deixa de existir.
- Antes de aplicar, guardamos uma cópia da etapa de cada peça, para poder desfazer.

## O que fica preservado
- Nenhum conteúdo é apagado.
- Só Owner, Admin e Super Admin alteram. Manager e User só veem.
- A lixeira de peças também segue o destino escolhido.

## Validação e entrega
- Confirmar o diagnóstico na Casa 8, só lendo, sem alterar nada.
- Testes: renomear e reordenar mantém cada peça na mesma etapa; uma coluna removida exige destino; um cliente que era exceção passa a seguir o padrão; a cópia permite desfazer; Manager não consegue aplicar.
- MASTER-first: nova versão, pacote, verificação e `master:check`.
- Publicar e depois atualizar a Casa 8 só com a sua autorização. A primeira unificação na Casa 8 roda com você revisando o resumo.

## Detalhes técnicos
- Migration aditiva: tabela `production_stage_migration_snapshots` (post_id, stage anterior, operação) com GRANT explícito, RLS e anon/PUBLIC revogados; `production_stages_apply` passa a ignorar `follows_brand_default` (sempre todos) e limpa a marca de exceção; o trigger `production_stage_local_exception` vira bloqueio de edição local de etapas fora do RPC.
- O mapeamento por chave e depois por label vai na prévia; o fingerprint continua protegendo contra prévia desatualizada.
- Kanban geral: agrupar por chave do padrão, não pelo label de cada pipeline.
- Na UI, remover `markProductionExceptionFn` e a opção "Manter clientes com exceção"; trocar `keepExceptions` por false fixo no servidor.
- Verify: nova tabela no check 80; atualizar `docs/PRODUCTION_STAGES_PHASE_B.md` e `AGENTS.md` (regra única: etapas de conteúdo sem exceção por cliente).
