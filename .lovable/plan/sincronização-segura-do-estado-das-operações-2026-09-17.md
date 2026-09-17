# Sincronização segura do estado das operações

## Objetivo
Impedir que uma operação com falha ou sem sinal de vida permaneça exibida como “Em execução”, preservando autenticação, lease, fencing, checkpoints e bloqueio contra tentativas duplicadas.

## Implementação
1. Centralizar a classificação visual de operação ativa, agendada, terminal e sem sinal de vida.
2. Fazer a leitura da página detalhada reconciliar referências órfãs e estados terminais já persistidos, sem acessar o destino e sem transformar falha em sucesso.
3. Manter operações automatizadas sob o worker canônico: uma lease expirada aparece como aguardando retomada, não como execução viva; operações manuais sem sinal são encerradas pelo fluxo protegido existente.
4. Interromper polling contínuo para estados terminais e reduzir polling de operações agendadas; manter polling somente enquanto houver execução ou retomada válida.
5. Mostrar status correto, etapa atual, migration/arquivo persistido, tempo decorrido e último erro, sem inventar evidência ausente.
6. Cobrir HTTP 400 antes do report, stale, lease perdida, referência órfã, estado agendado, terminal e prevenção de retry duplicado.

## Validação
- Testes locais focados do ciclo de operações, resiliência, leituras ambíguas e tela.
- Typecheck, lint focado, build e `bun run master:check`.
- Se houver alteração de código, cumprir MASTER-first e preservar os 85 blocos Client sem SQL Control-plane.
- Não publicar, executar SQL remoto, retry, deploy, criar recursos ou alterar o Apex.
