# Corrigir a atualização lenta e o progresso enganoso da Taveira

## Diagnóstico confirmado agora

A atualização atual da Taveira **não está travada**. Ela começou às 18:40, continua recebendo atividade e avançou de 12 para 10 migrations pendentes durante a análise. O cron do MASTER está ativo e chama o executor a cada minuto.

O problema percebido tem duas causas:

1. **O avanço visual volta para 0% entre migrations.** O executor calcula percentual apenas dentro da migration atual. Quando ela termina e ainda existem outras, salva a etapa como `running` sem percentual; a tela normaliza isso para 0%. Por isso a barra parece parada mesmo quando o texto e os checkpoints avançam.
2. **O executor processa uma única fatia por chamada e depois espera o próximo minuto.** Mesmo quando termina rapidamente uma migration, ele devolve `PENDING`, libera a operação para cinco segundos depois, mas não existe outro executor imediato; na prática, a próxima retomada vem apenas no cron seguinte. Com várias migrations pequenas, isso adiciona quase um minuto de espera por arquivo.

A operação atual está saudável: sem erro, sem tentativas consumidas e com lease/fencing funcionando. Reiniciar ou cancelar agora só faria perder tempo; ela deve continuar até concluir.

## Correção

1. **Mostrar progresso acumulado real do banco**
   - Calcular o percentual considerando todas as migrations da atualização, não apenas os comandos da migration atual.
   - Combinar migrations já concluídas com o avanço interno da migration em execução.
   - Preservar o percentual acumulado quando uma migration termina, em vez de gravar 0%.
   - Exibir no detalhe quantas migrations foram concluídas e quantas restam.

2. **Consumir várias fatias na mesma execução**
   - O executor continuará aplicando migrations enquanto houver tempo seguro na chamada.
   - Usar um orçamento curto e explícito, renovando o lease durante o trabalho.
   - Devolver ao cron somente quando o orçamento estiver perto do fim, quando houver espera externa ou quando surgir erro transitório.
   - Manter idempotência pelo ledger por migration e pelos checkpoints por comando.

3. **Não esconder falhas de checkpoint**
   - Parar de ignorar falhas ao registrar progresso.
   - Perda de lease encerra imediatamente aquela execução sem permitir gravação antiga.
   - Falha transitória de persistência entra no retry controlado; permissão inválida termina como bloqueio explícito.

4. **Preservar a operação atual da Taveira**
   - Não cancelar nem reiniciar enquanto ela continuar emitindo checkpoints.
   - Conferir ao final que passou por banco, código, publicação, validação e registro da versão 1.3.81.
   - Se ela parar de emitir atividade pelo limite definido, usar a retomada segura já existente, sem abrir uma operação concorrente.

## Testes necessários

- Percentual do banco nunca regride ao trocar de migration.
- Uma execução processa várias migrations pequenas dentro do orçamento.
- Uma migration grande continua em fatias e retoma do comando correto.
- O executor libera antes do limite de tempo e o cron retoma sem duplicar comandos.
- Lease perdido impede checkpoints e finalização por executor antigo.
- Erro transitório agenda retry; erro de permissão bloqueia sem repetição.
- A barra geral avança durante a etapa de banco e chega a 100% somente ao concluir todas as etapas.
- Atualização completa em instalação de teste, incluindo publicação e validação final.

## Fechamento MASTER-first

- Aplicar a correção somente no MASTER.
- Regenerar o pacote de deltas.
- Sincronizar `delta_version.txt` e `MASTER_RELEASE_VERSION` na próxima versão.
- Manter a verificação do instalador atualizada se houver mudança estrutural.
- Rodar testes direcionados, toda a suíte de instalações e `bun run master:check`.
- Publicar o MASTER e propagar para a Taveira somente com autorização explícita.

## Resultado esperado

A atualização deixa de esperar quase um minuto entre migrations pequenas, a barra mostra avanço acumulado verdadeiro e qualquer interrupção aparece como retry, bloqueio ou revisão — nunca como 0% aparentemente parado.
