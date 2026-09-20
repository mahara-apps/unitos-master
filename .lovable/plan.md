# Atualização documental do mapa factual de migrations

## Objetivo

Registrar, em uma futura alteração exclusivamente documental, a evolução do inventário de migrations sem modificar migrations, pacote Client, manifestos, versão, SHA ou comportamento de instalação.

## Estado factual validado

- Referência histórica em **16/09/2026**: **115 entradas** — 82 Client, 28 Control Plane, 3 split e 2 excluídas.
- Inventário local atual em **20/09/2026**: **119 entradas** — 84 Client, 30 Control Plane, 3 split e 2 excluídas.
- Posições **116–117**: Control Plane, mantidas fora do pacote Client.
- Posições **118–119**: Client, nesta ordem, incluídas no pacote e no manifesto.
- Pacote Client 1.4.19: 87 blocos, formados por 84 Client + 3 split.
- SHA oficial preservado: `917dc18928f3df612a3b1fff4ea05f8c70865a1b8e43d2312a4a18edb26c8c81`.

## Proposta de alteração futura

1. Criar uma referência documental vigente em `docs/MAPA_MIGRATIONS_MASTER_CLIENT.md` com:
   - data de corte do inventário;
   - contagens por destino;
   - distinção entre pacote Client e Control Plane;
   - posições 116–119, nomes, destino e ordem;
   - versão 1.4.19 e SHA oficial apenas como evidência do corte.
2. Adicionar somente links para essa referência vigente em:
   - `docs/CHECKLIST_NOVA_INSTALACAO.md`;
   - `supabase/install/README.md`.
3. Preservar os planos datados de 16/09/2026 como registros históricos. A afirmação de 115 entradas continuará correta quando explicitamente identificada como o corte daquela data; não reescrever documentos arquivados como se fossem atuais.
4. Corrigir, em etapa documental autorizada, referências posteriores que se apresentem como estado atual e tenham contagens divergentes, sempre mantendo o contexto histórico original.

## Limites da futura execução

- Não editar `supabase/migrations/**`.
- Não editar `migration-destinations.json`, `delta_manifest.txt`, `007_delta_migrations.sql` ou manifestos do Control Plane.
- Não alterar `delta_version.txt`, `MASTER_RELEASE_VERSION` ou qualquer SHA.
- Não regenerar pacote, não executar instalação, NEW, UPDATE, recovery ou provisionamento.
- Não acessar Supabase, GitHub ou Vercel e não publicar.
- Não criar commit automaticamente.

## Validação exigida após a futura edição documental

1. Recontar o mapa: 119 = 84 Client + 30 Control Plane + 3 split + 2 excluídas.
2. Confirmar pacote/manifesto: 87 = 84 Client + 3 split, com ordem e hashes individuais idênticos.
3. Confirmar ordem: 116→117 Control Plane; 118→119 Client.
4. Confirmar versão 1.4.19 e SHA `917dc18928f3df612a3b1fff4ea05f8c70865a1b8e43d2312a4a18edb26c8c81` sem mudanças.
5. Rodar `python3 supabase/baseline-snapshot/tools/test_build_delta.py` em modo read-only e `git diff --check`.
6. Inspecionar o diff e comprovar que somente documentação autorizada mudou.

## Estado desta etapa

Proposta preparada; nenhuma atualização documental oficial foi executada.
