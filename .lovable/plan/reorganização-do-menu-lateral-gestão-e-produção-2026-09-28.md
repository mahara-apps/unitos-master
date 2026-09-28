# Reorganização do menu lateral: Gestão e Produção

## Objetivo
Reorganizar apenas o menu lateral, mantendo o design e o comportamento atuais do Unitos:

```text
Visão
  Dashboard
  Analytics

Gestão
  Projetos
  Tarefas

Produção
  Calendário
  Pautas
  Conteúdo
  Mídia paga
```

Os grupos Inteligência e Agência permanecem como estão.

## Implementação
- Criar o grupo visual **Gestão** imediatamente após **Visão**.
- Mover **Projetos** e **Tarefas** do grupo atual para **Gestão**, preservando rotas, ícones, permissões, recursos habilitados, destaque de página ativa e contador de tarefas.
- Renomear **Trabalho** para **Produção**.
- Manter em **Produção**: Calendário, Pautas, Conteúdo e Mídia paga, na ordem atual relativa.
- Preservar o recolhimento do menu, os itens visíveis conforme perfil e o padrão visual já existente.

## Validação
- Adicionar ou ajustar teste focado para conferir grupos, ordem e ausência de duplicidade de Projetos/Tarefas.
- Verificar o menu aberto e recolhido na prévia, incluindo destaque ativo e contador.
- Executar TypeScript, testes focados e suíte global sem relaxar limites ou ocultar falhas.

## Entrega MASTER-first
- Aplicar a alteração somente no código do MASTER, sem mudanças de banco, RBAC, RLS ou autenticação.
- Regenerar o delta, manter `delta_version` e a versão MASTER iguais e regenerar os artefatos selados.
- Executar `master:check` e registrar separadamente qualquer falha ambiental preexistente.
- Não publicar o MASTER sem autorização explícita.
- Depois da publicação autorizada, atualizar cada instalação somente mediante autorização separada.
