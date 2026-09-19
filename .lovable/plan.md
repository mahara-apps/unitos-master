# Correção local e ensaio isolado da recovery 1.4.14

## Objetivo
Corrigir os dois falsos `FAIL` do controle 7 sem enfraquecer nenhuma validação, provar os cenários de assinatura em testes e executar a recovery em PostgreSQL local isolado.

## Implementação local
- Substituir a comparação textual de `pg_get_function_identity_arguments` por validações independentes do catálogo:
  - nomes e ordem via `proargnames`;
  - tipos, ordem e quantidade via `proargtypes`/`regtype[]`;
  - quantidade total via `pronargs`;
  - defaults e demais propriedades já verificadas;
  - contagem por nome para bloquear qualquer overload adicional.
- Preservar integralmente checks de corpo, retorno, linguagem, volatilidade, strict/leakproof/parallel, `SECURITY DEFINER`, `search_path`, owner, ACL e dependências.
- Atualizar o hash selado do preflight no manifesto da recovery, sem alterar a migration 1.4.14 nem o pacote Client.

## Testes
- Ampliar testes unitários para provar no SQL os contratos de nomes, tipos, ordem, quantidade e overloads.
- Criar um ensaio PostgreSQL local que monte somente o estado mínimo isolado requerido, execute o preflight e valide:
  - assinatura canônica nomeada: PASS;
  - representação textual sem nomes não causa falso FAIL;
  - nome, tipo, ordem ou quantidade incompatível: FAIL;
  - overload indevido: FAIL;
  - recovery em transação: objetos, ACL/RLS e ledger final corretos;
  - falha induzida: rollback integral.
- Executar testes focados, `master:check`, typecheck e lint dos arquivos alterados.

## Limites
- Zero conexão ou consulta remota durante esta etapa.
- Nenhum NEW, UPDATE, retry, P0, recovery remota, publicação ou deploy.
- O preflight remoto do Apex continuará bloqueado até novo pedido e autorização explícita.
