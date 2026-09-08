# Auditoria: sistema → MASTER → Taveira

## 1. O MASTER está publicado e completo? Sim

Verificado agora, item por item:

```text
versão aqui no projeto (pacote):        1.3.10
versão anunciada pelo sistema:          1.3.10
impressão digital do pacote:            2444dbe2…  (idêntica à calculada agora)
último ponto do código aqui:            d65a4b0
último ponto no repositório publicado:  d65a4b0   → iguais
site do MASTER responde:                sim
```

Verificações obrigatórias de sincronismo: **44 de 44 passaram**
(pacote regenerado, versão acompanhando o pacote, relatório de saúde cobrindo
todas as tabelas do pacote, e as quatro checagens novas de reconciliação de
versão).

Conclusão: **nada ficou de fora do MASTER**. Pacote, versão anunciada, relatório
de saúde e código publicado estão no mesmo ponto.

## 2. A Taveira recebeu tudo? Sim

```text
registro no painel:      1.3.10 · e9e0aea  · situação "em dia" · saúde "saudável"
código no repositório:   1.3.10 (publicado a partir do MASTER d65a4b0)
comparação arquivo a arquivo MASTER × Taveira:
  1.506 arquivos em cada um
  arquivos só no MASTER:    0
  arquivos só na Taveira:   0
  arquivos com conteúdo diferente: 0
```

Ou seja: a Taveira está com **exatamente o mesmo código** do MASTER, sem uma
única diferença.

Banco de dados: a última verificação de saúde da Taveira (hoje, 13h18 de
Brasília, já depois da publicação) fechou **30 verificações PASS**. A parte de
banco do pacote 1.3.10 é idêntica à da 1.3.9 (mesma impressão digital), então a
atualização de hoje foi só de código — não havia mudança de banco a aplicar.

Histórico das operações confirma o encerramento correto:

```text
16:18  verificação   sucesso  — 30 PASS
16:04  atualização   sucesso  — código do MASTER (1.3.10 · d65a4b0) publicado
13:07  atualização   falhou   — bloqueio antigo, já corrigido
```

## 3. Pontos abertos (nenhum bloqueia o funcionamento)

1. **Taveira sem o primeiro Super Admin.** A verificação avisa em todas as
   rodadas: é preciso abrir `/setup` na Taveira uma vez e criar o primeiro
   acesso de Super Admin. Não bloqueia a instalação, mas o ambiente fica sem
   dono até isso ser feito.
2. **Instalação "unitos-teste" em estado de atenção.** Ela nunca teve versão
   fixada (nenhum código publicado por aqui) e está marcada como `2026.09.0`.
   Se for um ambiente descartável, o certo é removê-la do painel; se for real,
   ela precisa de uma publicação de código para entrar na régua de versões.
3. **Cartão "Disponível no MASTER" pode ainda mostrar erro de leitura** no site
   publicado do MASTER, se ele não tiver sido publicado depois de a credencial
   de leitura do repositório ter sido cadastrada. Aqui a leitura funciona; é só
   o site publicado que pode estar com a credencial antiga.

## 4. Ações propostas (aprovar para eu executar)

- Nada de código a corrigir: a auditoria não encontrou divergência entre
  sistema, MASTER e Taveira.
- Limpar ou regularizar o registro da instalação "unitos-teste" (você decide:
  remover do painel ou publicar código nela).
- Publicar o MASTER uma vez, se o cartão "Disponível no MASTER" ainda mostrar
  erro de leitura.
- Você criar o primeiro Super Admin da Taveira em `/setup` (só você pode
  definir e-mail e senha).

## Detalhes técnicos

- Fontes conferidas: `supabase/baseline-snapshot/tools/delta_version.txt`,
  `MASTER_RELEASE_VERSION` em `src/lib/installation/manager-contract.ts`,
  impressão digital recalculada de `007_delta_migrations.sql`,
  `delta_manifest.txt` (55 migrations, última `20260907205706`, que é também a
  última em `supabase/migrations`).
- Comparação de repositórios via árvore recursiva do GitHub
  (`mahara-apps/unitos-master` × `mahara-apps/unitos-taveira`, branch `main`),
  comparando o hash de cada blob — 0 divergências, nenhuma árvore truncada.
- Estado lido em `public.installations` e `public.installation_operations` do
  MASTER.
- Testes executados (somente leitura):
  `installation-master-sync`, `installation-baseline-completeness`,
  `installation-version-reconcile` — 44 passaram.
- Nada foi alterado nesta auditoria.
