# Etapa 10 — integração real no Supabase de testes

## Objetivo
Validar o executor canônico usando exclusivamente o projeto Supabase `testes` (`limalqnfatlkczshqzgs`), com bloqueio explícito contra MASTER/Taveira e limpeza dos artefatos do ensaio.

## Execução
1. Criar um teste de integração real, opt-in, que exige `UNITOS_SUPABASE_MANAGEMENT_TOKEN` e confirma o ref exato `limalqnfatlkczshqzgs` antes de qualquer escrita.
2. Usar nomes e chaves exclusivos do ensaio, registrar evidência real no ledger/checkpoint e limpar tudo em `finally`.
3. Executar os quatro cenários: instalação limpa, falha parcial seguida de resume, replay da mesma release e `DROP FUNCTION` com assinatura inexistente.
4. Confirmar que ausência de evidência não promove versão e que a promoção só ocorre após todas as validações.
5. Registrar resultados objetivos, verificar a limpeza e parar imediatamente em qualquer divergência de projeto ou permissão.

## Limites
- Nenhuma chamada ao MASTER `tkjbhttylouamqxnbfgv`, Taveira ou produção.
- Nenhum secret será solicitado, exibido ou gravado.
- Nenhum reconcile/update de instalação real.
- Nenhum artefato permanente ficará no banco `testes` após o ensaio.

## Validação técnica
O teste chamará a Supabase Management API real e reutilizará `applyStatementByStatement` e as regras reais de evidência/promoção. O alvo será confirmado pela API de projetos antes das escritas; o teardown removerá somente objetos prefixados pelo identificador único do ensaio.
