# Corrigir consulta do commit do MASTER no GitHub

## Diagnóstico
A consulta isolada que lê o último commit do MASTER não envia o cabeçalho `User-Agent`, obrigatório pelo GitHub. Por isso, tanto a tentativa autenticada quanto a consulta pública de reserva recebem HTTP 403 com `Request forbidden by administrative rules`.

O erro afeta a identificação da versão publicada no painel. Não indica falha do banco, do provisionamento ou das instalações já concluídas.

## Alteração proposta
1. Padronizar essa chamada com os mesmos cabeçalhos GitHub já usados pelo restante do instalador: `Accept`, versão da API e `User-Agent` identificável.
2. Manter o token do MASTER na leitura autenticada e a consulta pública apenas como reserva para repositório público.
3. Adicionar teste que falha quando o `User-Agent` não for enviado nas duas tentativas e confirma a leitura do commit.
4. Preparar a próxima versão MASTER-first, regenerar o pacote e executar testes, tipagem e `master:check`.
5. Não publicar nem atualizar instalações sem nova autorização explícita.

## Resultado esperado
O painel volta a obter o commit do MASTER sem o falso alerta 403, preservando autenticação, isolamento e o comportamento das demais instalações.
