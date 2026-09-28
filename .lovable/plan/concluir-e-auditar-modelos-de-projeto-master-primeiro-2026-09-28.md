# Concluir e auditar modelos de projeto — MASTER primeiro

## Situação confirmada

**Ainda não está completo nem finalizado.** No código atual, a página de criação existe em **`/projects/models`**: em **Projetos → Modelos → Criar modelo**, é possível começar do zero ou selecionar um projeto existente. O diálogo **Novo projeto → A partir de modelo → Gerenciar modelos** também leva até lá. Esse caminho foi confirmado na prévia/código; a resposta pública do endereço de produção não comprova que a tela esteja publicada para uma sessão autenticada. O pacote local está marcado como **MASTER 1.4.51** e passou `master:check`, mas não houve autorização nem confirmação de publicação e atualização das instalações.

### Lacunas encontradas no plano original

- A edição permite reordenar jobs, mas não tarefas; não mostra responsáveis/envolvidos para edição, prévia nem revisão do conteúdo antes de salvar.
- A captura lê comentários do projeto/job, não comentários de tarefas nem briefings; usa limites fixos, podendo omitir conteúdo sem avisar. Tarefas diretamente ligadas ao projeto não entram no modelo. O texto marcado não permite escolher o destino; o código ainda o grava como comentário atribuível à pessoa que criou o novo projeto, em vez de conteúdo padrão sem autoria histórica.
- A criação a partir de modelo oferece apenas modelo, nome e cliente; faltam revisão de pessoas, texto e pendências de acesso antes da confirmação. Não há proteção demonstrada contra repetição da criação após perda da resposta.
- A rotina de salvar aceita a estrutura/textos enviados pelo navegador após validar apenas o acesso ao projeto de origem; não verifica se os trechos selecionados realmente pertencem à origem acessível. Os testes específicos do ciclo completo de modelos não foram encontrados. A verificação de instalação não confere explicitamente as novas funções/campos de modelos.

## O que entregar

1. **Descoberta e edição:** manter `/projects/models`, tornar **Modelos** e **Criar modelo** visíveis no fluxo de Projetos; adicionar edição de responsáveis, participantes, estimativas e ordem de jobs/tarefas, inclusive tarefas diretas, com resumo e prévia. Preservar modelos legados e do sistema.
2. **Captura segura de textos:** oferecer comentários e briefings acessíveis por projeto/job/tarefa com nada selecionado inicialmente; permitir escolher e revisar o destino de cada trecho. Paginar leituras e indicar limites; validar no servidor a origem e o escopo de cada trecho escolhido. Gravar somente texto padrão, sem autoria/data/menções/anexos do histórico, e exibi-lo como conteúdo padrão, não como comentário atribuído artificialmente.
3. **Revisão antes de criar:** mostrar cliente, estrutura, pessoas elegíveis e textos escolhidos; sinalizar e resolver responsáveis inelegíveis antes de confirmar. Revalidar RBAC/RLS no momento de criar; não copiar datas, registros de tempo, progresso, conclusão, peças ou histórico. Tornar a operação transacional e idempotente para tentativas repetidas.
4. **Auditoria verificável:** testar criação do zero, captura, edição, duplicação/arquivamento, modelos legados, nomes iguais, zero/alguns textos, tarefas diretas, paginação, escopo cruzado, acesso revogado, falha/rollback e resposta perdida. Testar a tela autenticada na prévia; verificar a rota no MASTER publicado e numa instalação somente após as respectivas autorizações.

## Entrega controlada

- Corrigir primeiro no MASTER; aplicar alterações de banco por migração, preservar as políticas existentes e conferir privilégios/escopo. Regenerar o delta, alinhar SHA e versão, ampliar a verificação de instalação e executar testes focados, suíte global sem relaxamentos e `bun run master:check`.
- **Não publicar nem atualizar instalações automaticamente.** Pedir autorização explícita para publicar o MASTER; depois, autorização separada para uma instalação de teste e, somente após aprovação, para cada uma das demais, com checagens antes/depois. Informar bloqueios em vez de afirmar entrega concluída prematuramente.
