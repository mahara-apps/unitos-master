# MASTER 1.3.89 — Resiliência das atualizações

## Objetivo
Eliminar as falhas transitórias do próprio MASTER que hoje podem interromper atualizações, consumir tentativas ou regredir silenciosamente o progresso. A Taveira continuará sob acompanhamento manual até este pacote ser publicado e validado.

## Ordem de implementação

1. **Integridade do progresso — prioridade máxima**
   - Tornar toda releitura de progresso obrigatoriamente sensível a erro: falha de leitura nunca reutiliza uma cópia antiga nem reinicia checkpoints.
   - Impedir percentuais, etapas concluídas e detalhes persistidos de regredirem.
   - Manter fencing token e lease como condição de qualquer checkpoint/finalização.
   - Cobrir progresso concorrente, leitura indisponível, estado antigo e retomada após falha.

2. **Leituras resilientes e classificação correta**
   - Verificar `error` antes de interpretar `data = null` como registro ausente.
   - Aplicar backoff exponencial limitado com jitter às leituras da instalação e do cofre.
   - Classificar separadamente ausência real, timeout, HTTP 5xx, HTTP 429 e falha de conexão, sem expor segredos.
   - Corrigir as ocorrências equivalentes nos caminhos críticos de retomada, finalização, operação ativa e reconciliação.

3. **Tentativas reservadas para falhas do destino**
   - Separar a fase de preparação no MASTER da execução contra a instalação.
   - Falhas transitórias do MASTER antes do primeiro acesso ao destino liberam a lease e reagendam a operação sem consumir `attempt_count`.
   - Falhas reais após iniciar trabalho no destino continuam usando retry e limite de tentativas.
   - Registrar a fase e a classificação para auditoria.

4. **Distribuição de carga e observabilidade**
   - Distribuir os jobs recorrentes para reduzir o pico simultâneo no início do minuto, preservando a cadência funcional.
   - Manter o acionador de retomada com janela compatível com uma fatia completa.
   - Registrar job, destino, duração, resultado e classe da falha para correlação, sem conteúdo sensível.

5. **Fechamento MASTER-first**
   - Aplicar migrations/RPCs aditivos no MASTER, preservando RBAC/RLS/auth e grants restritos.
   - Regenerar o delta, atualizar SHA e versão 1.3.89, ampliar a verificação da instalação e executar os guardiões MASTER-first.
   - Validar cenários de falha, concorrência e retomada; publicar e liberar a Taveira somente após autorização explícita.

## Critérios de aceite
- Uma falha de leitura nunca altera nem reduz progresso persistido.
- Ausência real e indisponibilidade transitória produzem estados distintos.
- Falha do MASTER antes de acessar o destino não aumenta o contador de tentativas.
- Falha do destino aumenta o contador exatamente uma vez.
- Duas execuções não escrevem simultaneamente na mesma operação.
- Atualizações com muitas fatias concluem sem revisão manual indevida.
- Os jobs não concentram todas as chamadas na mesma janela.
- Testes direcionados, `bun run master:check`, verificação do instalador e build passam.

## Prazo e entrega
Trabalho de **horas**, previsto para o ciclo atual, não para uma próxima sprint. A proteção de progresso será concluída e validada primeiro; as cinco correções serão publicadas juntas no MASTER 1.3.89 para evitar uma versão parcial com risco operacional conhecido.
