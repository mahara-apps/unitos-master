# Destravar a atualização 1.4.75 da Casa 8

## O que aconteceu (comprovado pelos prints e pelo código)
- Banco, código e publicação da 1.4.75 terminaram com sucesso na Casa 8.
- Só a validação final reprovou um item: a checagem 92 (histórico de chaves de IA).
- Essa checagem exige, entre outras coisas, que usuários logados **não** possam gravar, alterar ou apagar o histórico diretamente.
- A migração da 1.4.75 só dá permissão de leitura e retira o acesso anônimo, mas **não retira explicitamente** gravar/alterar/apagar dos usuários logados. Nas instalações de clientes, o banco concede esses acessos automaticamente a toda tabela nova; no MASTER isso não acontece, por isso aqui passou.

Causa provável: o histórico ficou gravável por usuários logados na Casa 8 e a validação, corretamente, recusou. Nenhum dado foi perdido e a versão anterior segue registrada.

## Passos
1. **Confirmar a causa** com uma consulta somente leitura no banco da Casa 8 (permissões da tabela, triggers e funções da checagem 92), sem alterar nada.
2. **Corrigir no MASTER** com uma migração nova, curta e repetível: retirar de usuários logados e anônimos o direito de gravar/alterar/apagar no histórico de chaves (leitura continua só para Owner/Admin/Super Admin pela regra existente).
3. Se a consulta mostrar outro item faltando (trigger ou função), incluir a correção na mesma migração.
4. Adicionar teste garantindo que toda tabela nova de auditoria revoga escrita de usuários logados.
5. MASTER-first: regenerar o pacote, subir para 1.4.76 em `delta_version.txt` e `MASTER_RELEASE_VERSION`, `bun run master:check`, build e testes.
6. Após sua autorização: publicar o MASTER e clicar "Autorizar nova atualização" na Casa 8 — ela retoma a partir do ponto comprovado.

## Fora de escopo
Nenhuma mudança em papéis, outras tabelas ou dados da Casa 8; nada é publicado sem autorização.
