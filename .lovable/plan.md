# Correção dos seis bloqueios operacionais do Control-plane 1.4.18

## Escopo

Alterar somente os artefatos locais de operação do Control-plane. Nenhuma tela nova, acesso remoto, alteração da Apex, execução de migration, freeze, recovery, UPDATE, cron, deploy ou publicação.

## Implementação

1. **Freeze**
   - Permitir ativação global com operações `pending` legítimas sem lease.
   - Bloquear `running`, lease presente, estados desconhecidos, tentativa ativa/órfã ou concorrência.
   - Manter triggers fail-closed para toda mutação operacional enquanto congelado.

2. **Executor**
   - Ajustar preflight e transação de instalação para preservar `pending` sem lease.
   - Ignorar somente tentativas `retryable` inequivocamente históricas ligadas a operações terminais.
   - Bloquear atividade, lease, vínculo órfão, estado desconhecido e ambiguidade.

3. **Recovery 1.4.14**
   - Permitir a recovery sob freeze com operações `pending` sem lease.
   - Provar por preflight e pós-condição que a recovery não altera, reivindica ou substitui operações.
   - Continuar bloqueando `running`, lease, tentativa ativa e ambiguidade.

4. **Cron 37**
   - Criar comando mínimo, versionado e autorizado que só ativa o job 37.
   - Exigir freeze desativado, contrato integral validado, executor instalado, recovery presente e ausência de execução concorrente.
   - Não criar, alterar comando/agendamento ou ativar outro job.

5. **Convergência**
   - Remover `--converge-existing` como caminho operacional agregado.
   - Expor convergência como ato isolado com confirmação própria; freeze, executor e recovery continuam comandos independentes.

6. **Promoção do Control-plane**
   - Criar estado de release próprio do Control-plane e RPC de promoção atômica.
   - Preservar a versão atual/pinned/commit até todas as validações passarem.
   - Aplicar lock, comparação de geração, hashes e pós-condições; não reutilizar operações de instalações clientes.

## MASTER-first e validação

- Atualizar inventário, verificador e documentação dos atos operacionais.
- Regenerar bootstrap/delta e alinhar `delta_version.txt` com `MASTER_RELEASE_VERSION` se o pacote Client mudar.
- Adicionar regressões para os seis pontos e ensaios PostgreSQL transacionais.
- Executar testes focados, `bun run master:check`, typecheck, lint dos arquivos alterados e build.
- Resultado final PASS/BLOCK com arquivos, comportamento anterior/novo e evidências; nenhuma ação remota.
