# Página inicial de Configurações

## Objetivo
Criar a página de Configurações com a mesma hierarquia visual da referência: título e descrição, seções temáticas e cards de navegação claros, responsivos e consistentes com o design system atual.

## Implementação
- Substituir o redirecionamento automático de `/settings` por uma página inicial real.
- Organizar os destinos existentes em seções de conta e workspace, usando cards com ícone, título, descrição e seta de navegação.
- Exibir somente opções permitidas pelo papel atual, preservando integralmente RBAC, rotas e telas internas existentes.
- Manter estados de carregamento e uma grade responsiva para desktop e mobile.
- Ajustar o destaque de “Configurações” na navegação sem alterar regras de negócio.

## Validação
- Executar testes focados relacionados a navegação/configurações, typecheck, lint dos arquivos alterados e build.
- Não alterar banco, autenticação, permissões ou pacote Client/Master.
