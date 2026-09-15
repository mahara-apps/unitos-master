# Suíte global no Master descartável

## Objetivo
Transformar o Master v1.4.0 no alvo explicitamente autorizado da suíte de integração, mantendo bloqueio absoluto para qualquer outro Supabase e para serviços externos.

## Implementação
1. Substituir a regra genérica `UNITOS_TEST_ENV=test` + “não produção” por um contrato explícito: propósito `INTEGRATION_TEST_SUITE`, referência autorizada versionada do Master e coincidência exata entre referência, URL e configuração do runner.
2. Fazer o `globalSetup` validar esse contrato antes de qualquer escrita e limpar apenas identidades/workspaces QA reconhecíveis; manter teardown determinístico e retries limitados.
3. Impedir que integrações apontem para outra referência ou acionem Git, Vercel, Taveira, instalações externas, webhooks ou jobs. O ensaio Management API específico de `testes` continuará isolado e não será habilitado no gate do Master.
4. Classificar corretamente testes remotos para evitar concorrência com auditorias de estado e executar todos os testes elegíveis sem reduzir cobertura.
5. Rodar testes da proteção e integrações afetadas; depois suíte global completa. Corrigir somente infraestrutura de teste até o gate ser verificável.
6. Finalizar com tipos, lint, build, `master:check`, testes focados e revisão do diff.

## Limites
- Nenhuma NEW limpa.
- Nenhum acesso à Taveira ou instalações legadas.
- Nenhuma alteração de produto ou publicação.
- O Master é tratado como descartável somente quando a referência exata e o propósito explícito coincidirem.
