# Correção ponta a ponta do Gerenciador de Ambientes

## Resultado esperado

Criação e atualização de ambientes deixam de depender da tela aberta, não repetem o pacote SQL inteiro e não mantêm operações zumbis. Cada operação terá execução exclusiva, retomada segura, limite de tentativas, reconciliação e diagnóstico por etapa.

## Implementação

### 1. Operação durável e exclusiva
- Evoluir `installation_operations` com estado operacional explícito (`queued`, `running`, `retryable`, `blocked`, `manual_review`, `success`, `failed`), etapa atual, próxima tentativa, máximo de tentativas, fencing token e diagnóstico estruturado.
- Substituir os claims atuais por funções atômicas que adquiram/renovem a lease, incrementem o fencing token e recusem qualquer gravação de um executor antigo.
- Tornar checkpoint, progresso e finalização obrigatórios e atômicos; a mesma transação fecha a operação, atualiza a instalação e libera o bloqueio.
- Interromper o trabalho assim que a lease for perdida e impedir retries ilimitados.

### 2. Um único executor no servidor
- Remover o watchdog da tela e sua função de retomada; polling ficará somente para leitura do progresso.
- A abertura da operação apenas cria a fila e dispara a primeira execução curta.
- O worker do servidor será o único caminho para provisionar, validar e atualizar; o cron ficará como reconciliador de operações vencidas.
- Processar cada instalação isoladamente para que falha de cofre ou provedor não aborte as demais.

### 3. Migrations realmente incrementais
- Gerar um manifesto empacotado com ID, hash, release e SQL de cada migration posterior ao snapshot.
- Criar no destino um ledger protegido por migration, registrando início, conclusão, tentativa, duração e erro.
- Atualizações aplicarão somente migrations ausentes; hash diferente para o mesmo ID bloqueará a operação.
- Instalações novas usarão o snapshot materializado e depois apenas as migrations posteriores ao corte.
- Manter uma transição compatível para instalações que possuem apenas o marcador cumulativo antigo, sem reaplicar mudanças destrutivas.

### 4. Publicação e reconciliação
- Reordenar atualização para: preflight → preparar código/deployment → migrations compatíveis → ativar/publicar → validar → registrar versão atomicamente.
- Persistir IDs externos e chaves de idempotência antes de avançar, reutilizando commit/deployment após timeout.
- Implementar reconciliação entre versão desejada, ledger remoto, commit fixado, deployment ativo, saúde e modo de manutenção.
- Limpar manutenção em sucesso, falha terminal e revisão manual; preservar durante retry curto.

### 5. Retries e observabilidade
- Classificar falhas terminais e transitórias por Supabase, GitHub e hospedagem.
- Aplicar backoff com jitter, orçamento de tentativas e circuit breaker por operação.
- Registrar duração, tentativas, lease perdida, retomadas, migrations aplicadas, chamadas por provedor e IDs de correlação.
- Exibir no histórico o estado, próxima tentativa, etapa, diagnóstico e ação disponível, sem expor credenciais.

### 6. Verificação
- Testar concorrência, perda de lease, duas autorizações simultâneas, crash antes/depois de checkpoint e replay de efeitos externos.
- Testar snapshot novo, upgrade de várias versões, migration já aplicada, hash divergente e falha isolada de uma instalação.
- Testar 401/403 terminais, 408/429/5xx transitórios, conflito Git, cota/build travado e manutenção.
- Executar os testes focados, verificações de tipos e qualidade, inspeção de segurança do banco e fluxo real autenticado disponível.
- Cumprir MASTER-first: regenerar delta, atualizar SHA e versão para `1.3.81`, atualizar a verificação do instalador e executar `bun run master:check`.

## Limites operacionais
- Nenhuma instalação será publicada ou atualizada sem autorização explícita.
- O MASTER não será publicado nesta execução; ficará pronto e validado para publicação.
- Credenciais permanecem cifradas e nunca entram em logs, respostas ou checkpoints.