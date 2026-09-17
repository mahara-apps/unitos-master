# Reconciliação segura de instalações legadas

## Objetivo
Permitir que uma instalação legada sem histórico individual de migrations avance somente quando o schema real comprovar, sem ambiguidades, quais blocos do pacote Client canônico já estão aplicados.

## Implementação
- Manter intacto o caminho atual para instalações com ledger e checkpoints canônicos válidos.
- Ao detectar apenas o marcador cumulativo legado, executar uma inspeção read-only do schema do destino pelo executor oficial.
- Gerar, no MASTER, um contrato determinístico de evidências por migration a partir dos 85 blocos Client canônicos, cobrindo objetos estruturais verificáveis: tabelas, colunas, tipos/defaults, constraints, índices, RLS, policies, grants, funções e respectivas propriedades, triggers e demais objetos catalogáveis.
- Classificar cada migration como comprovada, divergente ou sem evidência suficiente. Nunca inferir aplicação por versão, ordem, marcador cumulativo ou presença parcial.
- Exigir um prefixo canônico contínuo: uma migration só será reconciliada quando todas as evidências obrigatórias dela coincidirem; qualquer divergência, lacuna ou migration não comprovável mantém o bloqueio antes de executar SQL incremental.
- Persistir as migrations comprovadas no ledger do destino e no progresso durável da operação usando os mecanismos existentes, com arquivo, fingerprint, posição, total de statements, lease e fencing. A gravação será idempotente e monotônica.
- Após a reconciliação aprovada, continuar pelo primeiro bloco não comprovado usando o executor incremental atual, sem alterar checkpoints, retries, autenticação, RBAC ou RLS.

## Segurança
- A inspeção não altera dados nem estruturas.
- A única escrita da reconciliação será a evidência técnica comprovada nas tabelas auxiliares já protegidas.
- Nenhuma migration com DML ou efeito não observável será marcada apenas por consequência presumida; se não houver pós-condição estrutural canônica suficiente, a instalação continuará bloqueada.
- Pacote, manifesto, versão, SHA e identidade fixada da operação continuarão sendo validados antes da reconciliação.
- Nenhum SQL manual/remoto, atualização real, retry automático ou criação de recurso será executado nesta entrega.

## Testes
- Instalação moderna com ledger válido mantém o fluxo atual sem inspeção legada.
- Instalação legada sem histórico e schema integralmente comprovável gera evidências canônicas e continua.
- Schema divergente permanece bloqueado e não grava evidências.
- Reconciliação repetida é idempotente e não reduz progresso.
- Evidência ausente ou insuficiente permanece bloqueada.
- Prefixo descontínuo, fingerprint incompatível, pacote divergente e perda de lease/fencing falham fechados.
- Regressões dos fluxos NEW, UPDATE, manifesto legado e retomada continuam aprovadas.

## Entrega MASTER-first
1. Criar a migration canônica necessária no MASTER, com grants e RLS explícitos se houver nova estrutura.
2. Atualizar o executor e os contratos/testes locais.
3. Regenerar pacote e manifesto com `build_delta.py`, mantendo exclusivamente os blocos Client previstos pelo mapa.
4. Avançar e sincronizar `delta_version.txt`, `MASTER_RELEASE_VERSION` e o selo do bootstrap Master.
5. Atualizar o verificador de instalação para cobrir a evidência criada.
6. Executar testes focados, `master:check`, suíte local, typecheck, lint focado e confirmar build OK.
7. Publicar o MASTER somente após todos os gates passarem; não iniciar a atualização do Apex.
