# Tornar criação e atualização de ambientes confiável de ponta a ponta

## Objetivo
Eliminar falhas e falsos resultados no cadastro, provisionamento, retomada, atualização e validação de instalações. O resultado será comprovado em um ambiente descartável real e depois aplicado e revalidado no Apex, sem publicar ou propagar nada sem nova autorização explícita.

## Achados confirmados
- O Apex concluiu 11/11 etapas, mas seis arquivos do baseline ficaram registrados com falha e a validação terminou com 5 de 25 checks em FAIL. Hoje a conclusão operacional e a evidência de aplicação podem divergir.
- A retomada usa uma concessão de 90 segundos renovada apenas em alguns pontos. Uma chamada externa lenta pode permitir duas execuções simultâneas da mesma operação.
- O painel declara operações paradas após quatro minutos, enquanto o cron tenta retomá-las após 90 segundos. Esses mecanismos podem disputar a mesma execução e aceitar gravações tardias de processos já encerrados.
- A RPC grava o estado `updating`, mas esse estado não existe no contrato da aplicação. A interface o converte para “Preparando” e pode bloquear novas tentativas.
- A validação classifica alguns erros de seeds e schema como erro genérico de banco na linha do tempo, embora os cartões de saúde usem outra categoria.
- O SQL de validação possui ordem duplicada, checks compostos com diagnóstico insuficiente e um check de retomada que pode passar quando o cron não existe.
- Os testes atuais cobrem muitas partes isoladas e mocks, mas não cobrem retomada concorrente, processo cancelado com escrita tardia nem o ciclo real criação → publicação → validação → atualização.
- No MASTER, o cron de retomada está ativo a cada minuto e aponta corretamente para o endpoint estável com autenticação própria.

## Correções
1. **Estados e conclusão coerentes**
   - Tornar o estado de atualização parte oficial do contrato, interface, transições e testes.
   - Impedir `PASS`, versão atualizada ou 100% quando checkpoints obrigatórios falharam, ficaram ausentes ou foram apenas iniciados.
   - Fazer a conclusão depender da validação final e das evidências persistidas da execução.

2. **Execução única e retomada segura**
   - Adotar lease explícito por operação, com proprietário e validade, renovado durante toda chamada longa.
   - Fazer claim, heartbeat, progresso, cancelamento e finalização recusarem processos sem lease válido ou operações já encerradas.
   - Unificar os tempos de retomada e abandono; o cron retoma, enquanto o painel apenas apresenta o estado, sem competir com o worker.
   - Preservar checkpoints idempotentes e impedir reaplicação concorrente do mesmo lote.

3. **Falhas externas previsíveis**
   - Padronizar timeout, retentativa limitada e classificação de erros para Supabase, GitHub e hospedagem.
   - Distinguir indisponibilidade transitória, credencial ausente/ilegível/revogada, limite do provedor e erro definitivo.
   - Persistir diagnóstico sanitizado por serviço e etapa, sem expor tokens.
   - Manter BYOK fail-closed: instalações que exigem token próprio nunca usam o token central.

4. **Validação determinística**
   - Usar uma única fonte de classificação para linha do tempo e cartões de saúde.
   - Separar checks compostos para informar exatamente qual requisito falhou.
   - Corrigir a ordem duplicada e tornar obrigatórios os recursos esperados para a versão instalada, inclusive o mecanismo de retomada quando aplicável.
   - Validar schema, enums, tabelas, funções, RLS, grants, storage, seeds, cron, URLs, isolamento, versão aplicada e primeiro acesso.
   - Comparar a saída do caminho automatizado com o caminho manual para evitar falso PASS/FAIL.

5. **Observabilidade e recuperação**
   - Registrar tentativas, duração, lease, retomadas, último heartbeat, erro normalizado e próxima ação em cada operação.
   - Exibir claramente “em execução”, “retomando”, “bloqueado”, “falhou”, “cancelado” e “pronto”.
   - Detectar cron de retomada inativo ou sem chamadas e mostrar alerta operacional acionável.
   - Garantir que cancelar/reiniciar não permita escritas de uma execução antiga.

## Testes
- Testes unitários e de integração para estados, lease, duas retomadas simultâneas, heartbeat, cancelamento, escrita zumbi, checkpoints, seeds idempotentes, erros por provedor e classificadores extraídos do SQL real.
- Teste completo com falhas injetadas em cada fronteira: Supabase, GitHub, hospedagem, publicação, aplicação do baseline, secrets, cron e validação.
- Criar um ambiente descartável real com Supabase, repositório e publicação próprios; executar cadastro, BYOK, provisionamento, interrupção/retomada, validação, atualização e cancelamento.
- Confirmar isolamento do MASTER, URLs próprias, secrets próprios, ausência de dados de negócio herdados e limpeza dos recursos descartáveis ao final.
- Aplicar a versão corrigida no Apex, executar atualização e validação reais e exigir todos os checks obrigatórios em PASS; pendências legítimas de primeiro acesso permanecem identificadas separadamente.

## MASTER-first
1. Aplicar código e migrations no MASTER.
2. Regenerar o delta e atualizar SHA/version e `MASTER_RELEASE_VERSION` com o mesmo valor.
3. Atualizar `verify-installation.sql` e seus testes de completude.
4. Executar tipos, testes focados, suíte de instalação, `bun run master:check` e verificação do preview.
5. Não publicar o MASTER nem propagar para Apex sem nova autorização explícita. A criação do ambiente descartável e as chamadas reais aos provedores ficam autorizadas por este plano; publicação/propagação de produção não.

## Critérios de aceite
- Nenhuma operação concorrente para a mesma instalação ou operação.
- Nenhum estado desconhecido e nenhuma operação presa sem diagnóstico ou retomada.
- 100% só aparece quando todas as etapas e checkpoints obrigatórios foram comprovados.
- Validação sem falso PASS/FAIL e com causa específica para cada falha.
- Ambiente descartável completa provisionamento, retomada, atualização e validação reais.
- Apex termina atualizado, saudável e com validação integral; qualquer bloqueio externo é mostrado com a ação exata.
- Pacote MASTER, versão, delta e verificador permanecem sincronizados.
