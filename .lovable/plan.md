# Corrigir a falha da atualização 1.4.71 na Apex

## O que aconteceu
- Na Apex, o banco foi atualizado por completo (último comando 25/25), o código foi publicado e o build passou. Só a **validação final** falhou, então a versão não foi registrada.
- A causa está no MASTER, não na Apex: a 1.4.71 **substituiu** a trava antiga de colunas (`production_stage_local_exception`) por uma nova (`production_stage_workspace_guard`). O verificador da instalação (check 91) continuou esperando o nome antigo. Ele encontra 2 das 3 travas e reprova.
- Nenhum conteúdo, peça ou cliente da Apex foi perdido. O banco está na estrutura nova e correta.
- Casa 8: pelo código, o mesmo check deveria ter falhado lá também. Vou conferir o histórico da operação da Casa 8 (somente leitura) para confirmar se a validação final rodou ou se terminou com outro resultado. Até isso ser conferido, a diferença entre as duas fica sem explicação.

## Correção (MASTER-first)
1. Atualizar o check 91 do verificador para esperar `production_stage_workspace_guard` no lugar da trava antiga. Dividir o check em itens separados (funções, permissões, tabelas protegidas, travas) para que uma falha futura diga exatamente o que falta.
2. Adicionar um teste que compara os nomes de trava e de função usados pelo verificador com os criados pelas migrations. Assim, renomear algo sem atualizar o verificador reprova antes da publicação.
3. Gerar o pacote 1.4.72, sincronizar versão e SHA e rodar `bun run master:check` e os testes focados.
4. Conferir somente em leitura, na Apex e na Casa 8, se as três travas atuais existem.

## Depois da sua autorização
5. Publicar a 1.4.72.
6. Clicar em "Autorizar nova atualização" na Apex. As migrations já aplicadas são puladas pelos checkpoints, e a validação final deve passar.
7. Revalidar a Casa 8 com o verificador corrigido.

## Limites
- Nada de alterar RBAC, RLS ou dados de negócio. Nenhum reset nem reaplicação manual de SQL na Apex.
