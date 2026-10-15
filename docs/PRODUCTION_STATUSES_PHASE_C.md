# Fase C — Status de produção de conteúdo

## MASTER 1.4.68
- Configurações › Status de trabalho inclui o grupo Produção de conteúdo.
- O grupo edita as mesmas etapas de Regras de produção, sem copiar registros para work_statuses e sem alterar os escopos de Projetos, Tasks ou Sub-tasks.
- “Conta como concluído” usa is_terminal, já consumido pelos cálculos de SLA e indicadores de produção.
- Nome, cor, ordem, SLA, portal e link de aprovação permanecem ligados à mesma etapa canônica.
- Salvar o padrão não altera quadros existentes; aplicar exige prévia, preservação das exceções e destino para etapas ocupadas.
- Owner/Admin/Super Admin configuram; Manager/User somente consultam. A interface agora usa a matriz canônica em vez de tratar Manager como Admin.
- Nenhuma migration necessária: estrutura, RPCs, grants e RLS da Fase B reutilizados. A verificação de instalação cliente 91 já cobre essa estrutura.
- Ajuste ao detalhe técnico do plano: não foi criado escopo content persistido em work_statuses, pois duplicaria a fonte das etapas e permitiria divergência do quadro.

## Testes
- 15/15 testes focados passaram, incluindo oito novos testes de conclusão/permissões e ensaio real em Postgres isolado.
- Ensaio SQL: salvar conclusão sem mudar quadro existente, aplicar após prévia mantendo ID da etapa e aprovação da peça, desmarcar conclusão; regressões de exceção, destino, concorrência e RBAC cobertas.
- Teste de integração Supabase adicionado para salvar/prévia/aplicar/ler conclusão na mesma etapa; execução depende do QA disponível.
- Suíte local/runtime: 1.557/1.557 testes passaram em 170 arquivos.
- `bun run master:check`: PASS; versão 1.4.68, delta, bootstrap, recovery e contrato sincronizados.
- Compilação da prévia: OK; navegador sem erros de execução.
- Suíte global tentada: bloqueada antes dos testes por timeout original de 12 segundos na inspeção do QA; nenhum timeout alterado nem falha ignorada.
- Navegador redirecionou para `/login?next=%2Fsettings%2Fwork-statuses`. Sessão indisponível no Supabase externo; a interação autenticada e a renderização do grupo não foram validadas ponta a ponta.
- Nada publicado, nenhuma instalação atualizada e nenhum padrão aplicado a clientes reais.

SHA do delta (sem mudança de schema): `c518784f3835e217f93d69b083706a1eb39a938e73a06d7ccfdcc9b1f8864566`.