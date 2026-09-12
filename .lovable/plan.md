# Destravar e tornar autônoma a atualização da Taveira

## Diagnóstico confirmado

- A atualização não perdeu progresso: avançou de **350/716 (49%)** para **375/716 (52%)** durante a investigação.
- O banco é atualizado em lotes seguros de 25 comandos e grava um checkpoint após cada lote.
- O intervalo longo observado é causado pela retomada depender da tela aberta: o painel chama o watchdog, mas ele só assume o próximo lote quando o último sinal tem mais de 90 segundos. Isso pode parecer travamento e deixa a execução sem avanço quando ninguém acompanha a tela.
- O comando atual no ponto observado era apenas a transição entre policies de `client_requests`; não há erro de SQL registrado.

## Correção

1. Criar um watchdog público autenticado por `CRON_SECRET`, sem depender do navegador, para retomar operações automáticas pendentes.
2. Reutilizar a mesma lease distribuída e os checkpoints existentes, evitando executores concorrentes e repetição de comandos já aplicados.
3. Agendar o watchdog no MASTER e incluí-lo no pacote das instalações, mantendo o processo MASTER-first.
4. Manter o polling da tela apenas como acompanhamento e recuperação adicional, não como motor principal.
5. Adicionar regressões para operação em lotes, retomada sem tela, autenticação do cron e ausência de duplicação.
6. Regenerar o delta, sincronizar a nova versão do MASTER, atualizar a verificação da instalação quando aplicável e executar `master:check` e os testes direcionados.
7. Acompanhar a operação atual da Taveira até sair da etapa de banco; não marcar a versão como concluída antes do deployment Git `READY` e da validação final.

## Limites

- Não alterar dados operacionais, papéis, RLS ou credenciais da Taveira.
- Não reiniciar a atualização do zero enquanto o checkpoint atual continuar válido.
- Não publicar o MASTER nem iniciar outra atualização sem autorização explícita.
