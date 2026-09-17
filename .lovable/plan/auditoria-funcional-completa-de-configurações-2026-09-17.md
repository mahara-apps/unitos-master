# Auditoria funcional completa de Configurações

## Objetivo
Validar a página inicial de Configurações e todas as telas acessadas por seus cards, corrigindo somente problemas funcionais ou visuais encontrados, sem ampliar nem reduzir permissões.

## Escopo da auditoria
- Conferir os oito cards, seus destinos, navegação ativa e retorno para Configurações.
- Comparar a visibilidade dos cards e das abas com o papel efetivo atual, mantendo o RBAC e os bloqueios do servidor intactos.
- Validar carregamento, vazio, erro e ausência de workspace nas telas de Perfil, Notificações, Agência, Equipe, Permissões, Status de trabalho, Acessos e Auditoria.
- Verificar teclado, foco, rótulos, conteúdo longo e layouts em celular, tablet e desktop.
- Confirmar que rotas diretas não expõem telas administrativas durante a resolução das permissões.

## Correções
- Corrigir apenas inconsistências comprovadas de navegação, apresentação, acessibilidade ou tratamento de estado.
- Reutilizar os componentes e padrões existentes do design system.
- Não alterar regras de papel, RLS, autenticação, banco, pacote Client ou migrations.
- Adicionar testes de regressão focados nos problemas corrigidos.

## Validação
- Executar testes focados de Configurações e permissões, suíte local, typecheck, lint focado e build.
- Testar a navegação e os layouts disponíveis no preview com Playwright; quando a sessão autenticada não estiver disponível, registrar claramente essa limitação e validar os fluxos protegidos por testes e inspeção estática.
- Revisar os diagnósticos finais do preview e entregar um relatório objetivo com itens aprovados, correções realizadas e qualquer bloqueio remanescente.
