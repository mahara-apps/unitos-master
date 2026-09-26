# Recuperação da remessa: caminho 1 com retaguarda e pontos de parada

## Objetivo e limites

Recuperar a remessa existente, sem refazer a NXT, sem recriar operações, sem alterar RBAC/RLS/autenticação e sem liberar as quatro sucessoras antes de comprovar a reconciliação. **Aprovar este plano autoriza apenas preparar e validar o procedimento; não autoriza nenhuma escrita remota, publicação, reparo nem retomada.** Cada ato operacional terá autorização própria.

## Base confirmada por leitura

- O pacote local está selado como MASTER **1.4.45**, SHA-256 do delta `f6e8e0bea23c80e93bdc52b4245fcafa1ff3a94e0d76ae2a83c90a2a5601f18b`; o contrato próprio do Control-plane também declara 1.4.45. A publicação do site não instalou esse contrato no banco.
- O estado remoto do Control-plane ainda marca **1.4.20**, geração **1**; o freeze está **desligado**, geração **2**. A função de finalização instalada não contém as pós-condições do contrato corrigido. Reconfirmar tudo imediatamente antes de qualquer ato: estas observações têm prazo de validade operacional curto.
- A remessa `261f5362-5afd-4856-b9d3-80d88362cf7f` tem cinco posições. A NXT (`9d938a39-f661-4561-9bb0-21828ae883ac`) está `success`, sem `reconciled_at` nem lease; quatro sucessoras estão `pending`, sem lease. A NXT está vinculada ao pacote **1.4.43**, commit `fb3f3b12d55ed79a268a34edc451c70fc9809785`, SHA acima e 93 migrations. O destino operacional da remessa continua 1.4.43; não substituí-lo por 1.4.45.
- O procedimento oficial contém validação de identidade, gate de backup/risco auditado, preflight **11/11**, transações, verificações e aprovações específicas. A ferramenta de migration altera estrutura e registra uma migration comum; a ferramenta de dados admite alterações de registros, não reproduz automaticamente os scripts psql nem as chamadas de controle. **Não presumir equivalência.**

## Fase 0 — Projetar e provar o adaptador, sem escrita remota

1. Inventariar integralmente o contrato instalado e o selado: definições e permissões das funções, gatilhos de freeze, cron/claims, ledger, checkpoints, cinco operações, tentativas, outbox, selos e versões; fotografar somente dados sanitizados e horários. Investigar qualquer divergência antes de avançar.
2. Determinar a capacidade real de cada ferramenta, sem experimentar no MASTER: migration para a troca **exclusiva** da função/estrutura MASTER-only; mecanismo de escrita de dados para chamar as funções canônicas de freeze, promoção e reconciliação sem `UPDATE` direto nem contornar RLS/guards. Os scripts psql existentes contêm `\set`, `\ir` e variáveis: não são SQL pronto para colar na migration. Se a interface não permitir executar os atos equivalentes de forma atômica e auditável, **encerrar o caminho 1** e oferecer o executor administrativo oficial; não improvisar um `UPDATE` ou ocultar um ato de dados dentro de uma migration de esquema.
3. Evitar que uma migration operacional MASTER-only seja incluída no delta das instalações: comprovar em ensaio que o registro gerado pela ferramenta e o mapa de destinos não induzem propagação, divergência de ledger ou reprovação dos guardiões. Se não houver forma suportada de isolar esse registro, não usar a ferramenta para o contrato.
4. Preparar SQL de guarda fail-closed com identidade do projeto, versão/commit/hash do contrato, geração esperada e estado exato da remessa; locks e verificações dentro **da mesma transação** de cada ato. Não alterar os arquivos canônicos sem novo selo MASTER-first. Comparar byte a byte o corpo da função a instalar com o contrato selado, inclusive privilégios; nenhuma substituição genérica de schema.
5. Ensaiar em cópia isolada e sanitizada com cardinalidade/ledger/checkpoints reais: sucesso, erro/timeout, resposta vazia genuína, resposta válida, perda da confirmação após commit, concorrência, crash e replay. Comparar mudanças antes/depois e provar que as quatro sucessoras não iniciam sob freeze. Executar testes focados, verificador MASTER, `master:check` e suíte global sem relaxar critérios; registrar qualquer bloqueio como bloqueio. **Saída:** matriz de evidências e conclusão expressa: caminho 1 APTO ou INAPTO. Nada remoto é alterado nesta fase.

## Fase 1 — Proteção e contenção (autorização separada)

- Apresentar ao responsável as duas escolhas reais: backup restaurável identificado e verificado **ou** aceitação formal, específica e registrada do risco global sem backup. Sem uma dessas evidências, parar. Registrar responsável, horário, alvo e identificador da evidência em local durável, sem segredos no chat; aprovação da ferramenta não substitui essa decisão.
- Fazer nova auditoria somente leitura, com identidade do MASTER e snapshot sanitizado. Confirmar nenhuma operação/tentativa ativa, lease válida, item paralelo ou divergência de gerações; cron sem claims efetivos. Solicitar autorização explícita **só para congelar**.
- Ativar o freeze pela função canônica com geração esperada e motivo; confirmar por nova leitura freeze ligado, evento auditável e zero executor/claim ativo. Se o freeze falhar ou resposta for ambígua, ler o estado antes de qualquer tentativa de novo comando; não avançar. Manter a fila parada mesmo se as etapas seguintes forem canceladas.

## Fase 2 — Finalizador corrigido e promoção (autorizações próprias)

1. Sob freeze confirmado, repetir o preflight oficial **11/11** e as pré-condições transacionais. Com autorização específica para instalação, trocar somente o finalizador MASTER-only corrigido com os mesmos grants/revokes, locks e pós-condições do contrato selado. Verificar a definição instalada, aceitação do fingerprint operacional, preservação de `baseline_hash`, fencing/lease, pins atômicos e ausência de alterações nas cinco operações; o verificador MASTER deve passar integralmente. Se falhar: **não promover nem liberar**; verificar se a transação foi revertida e manter freeze.
2. Com autorização **distinta** para promoção, conferir novamente geração e hash do contrato; invocar a promoção canônica com evidências de validação reais, nunca flags fictícias. Confirmar estado e evento da geração seguinte, versão 1.4.45, commit e hash idênticos ao contrato aprovado. Manter freeze ativo. Se resultado ambíguo, consultar estado/evento antes de repetir; sem promoção parcial presumida.

## Fase 3 — Reparo exclusivo da NXT (autorização separada)

- Antes do reparo, auditar diretamente o destino NXT em somente leitura: efeitos das 93 migrations, chaves naturais/duplicatas, objetos e ledger contra checkpoints; se acesso ao destino faltar, registrar auditoria **BLOQUEADA** e não inferir integridade só pelo registro no MASTER.
- Só com evidência integral executar a lógica do reparo canônico em **uma transação**: freeze e geração, operação/remessa/posição 1, status `success`, cinco etapas `done`, flags finais, commit, release 1.4.43, SHA, 93 posições contíguas, nenhuma lease/tentativa ativa, instalação e ausência de concorrência. A janela `unfreeze → reconciliar/pinar → freeze` precisa ser indivisível e comprovada equivalente ao script; se a ferramenta não garantir isso, **não executar pelo caminho 1**.
- Conferir NXT `success` e reconciliada, pins corretos, ausência de migrations/tentativas adicionais, quatro sucessoras intocadas, freeze ligado e verificador integral. Falha ou confirmação ambígua: não repetir sem leitura, não apagar evidências, manter a contenção.

## Fase 4 — Retomada controlada (autorização separada)

- Somente após o reparo comprovado e nova auditoria das cinco posições, autorizar retirada do freeze com a geração corrente. Deixar o cron normal assumir, sem claim manual e sem clicar em “Atualizar/Tentar novamente”. Acompanhar **Casa 8 → Apex → Taveira → unitos-new-teste-02**, liberando a seguinte apenas após sucesso reconciliado, versão e pins corretos, checkpoint monotônico e verificação direta do destino.
- Se erro, timeout, resposta inválida, perda de lease ou divergência: tentar congelar com a geração atual **apenas quando não houver executor ativo**; caso contrário primeiro conter com segurança e provar quiescência. Preservar histórico e sucessoras pendentes; retomar somente por nova decisão explícita.

## Retaguarda, evidências e encerramento

- Antes de cada escrita: registrar consulta sanitizada, horário, identidade do MASTER, valores esperados/observados, hash e autorização daquele ato. Depois: verificar o resultado por leitura independente. Um commit sem resposta não é falha nem sucesso presumido; ler ledger/evento antes de repetir.
- Não fazer rollback cego de função, pacote ou registros após promoção/reconciliação. Antes do primeiro commit, a transação reverte tudo; depois, manter freeze e projetar correção forward-fix específica com evidência, autorização e novo selo MASTER-first. Restaurar backup inteiro pode apagar atividade legítima: somente após análise de impacto e autorização própria.
- Entregar inventário de cada ocorrência com resposta real sanitizada, três controles (erro/vazio/válido), reprodução exata, ensaio completo, auditoria direta, versões/hashes, testes e estado de cada instalação. Encerrar apenas com cinco operações reconciliadas e destinos auditados, nenhuma duplicação/corrupção ou reparo comprovado, Control-plane coerente e freeze desligado com cron saudável. Qualquer controle indisponível deixa a recuperação **aberta e bloqueada**, com o impedimento nomeado.

**Regra de saída do caminho 1:** se a ferramenta não preservar atomicidade, isolamento MASTER-only, autorização/auditoria ou leitura direta dos efeitos, interromper sem adaptação parcial. O caminho de retaguarda é executar os scripts oficiais em ambiente administrativo protegido, também com backup ou aceitação formal do risco e as mesmas autorizações separadas. Não pedir senha no chat.
