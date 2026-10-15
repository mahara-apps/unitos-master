# Corrigir erro na prévia de "Produção de conteúdo"

## O que acontece
Ao clicar em "Ver prévia", a tela mostra um erro técnico: três clientes da lista (posições 2, 3 e 5) vieram **sem nome**, e a tela rejeita a resposta inteira.

## Causa provável (a confirmar no passo 1)
A prévia monta o nome do cliente procurando o cliente do quadro dentro da lista de clientes do workspace. Quando não acha, o nome vem vazio. Isso ocorre se o quadro:
- não está ligado a um cliente (quadro geral do workspace), ou
- aponta para um cliente removido ou de outro workspace.

## Passos
1. Consultar (somente leitura) os quadros padrão do workspace e identificar os três sem nome correspondente.
2. Ajustar a prévia no banco (nova migration aditiva, via `CREATE OR REPLACE`, sem mudar permissões):
   - incluir na prévia apenas quadros de clientes válidos do workspace;
   - quadros sem cliente válido não recebem aplicação e são listados à parte como "ignorados";
   - nome cai para "Cliente sem nome" quando o cadastro estiver vazio.
   - Aplicar a mesma regra em `production_stages_apply` para prévia e aplicação nunca divergirem.
3. Tela: aceitar nome ausente com rótulo amigável e mostrar mensagens de erro em português, nunca JSON bruto.
4. Testes: caso com quadro sem cliente, cliente de outro workspace e cliente sem nome (unitário + ensaio SQL isolado).
5. MASTER-first: regenerar pacote, nova versão 1.4.69 em `delta_version.txt` e `MASTER_RELEASE_VERSION`, cobrir em verify, `bun run master:check`. Sem publicar nem atualizar instalações.

## Resultado esperado
A prévia abre normalmente, lista os clientes com nome e indica claramente quadros que não serão alterados.
