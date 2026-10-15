# Alterar etapas também nos clientes que já existem

## Situação atual
- "Salvar padrão para novos clientes" só grava o modelo; os quadros atuais não mudam (por isso a mensagem).
- O botão "Prévia de aplicação" já atualiza os clientes existentes: renomeia, muda cor e ordem das colunas, e as peças continuam na mesma etapa (a etapa é identificada por uma chave fixa, não pelo nome).
- O problema é de clareza: o caminho certo não está evidente.

## O que muda
1. Botão principal passa a ser **"Salvar e aplicar aos clientes"**: grava o padrão e abre a prévia.
2. A prévia separa as mudanças em:
   - **Só nome/cor/ordem** — peças não se movem; confirmação simples.
   - **Etapa removida com peças** — continua exigindo escolher para onde as peças vão (nada some).
3. O botão antigo vira o secundário **"Salvar só para novos clientes"**.
4. Depois de aplicar, o Kanban, o calendário e as listas recarregam com os novos nomes e a nova ordem, sem precisar atualizar a página.
5. Clientes marcados como exceção continuam intocados enquanto "Manter clientes com exceção" estiver ligado.

## Regras preservadas
- Só Owner/Admin/Super Admin aplicam; Manager/User só veem.
- Nenhuma peça, aprovação ou comentário é apagado.

## Detalhes técnicos
- `workspace-stages.tsx`: novo fluxo save → preview → apply; textos e toasts revisados.
- Conferir que `production_stages_apply` também grava o padrão; se não, chamar `save` antes da prévia (o fingerprint já protege contra prévia desatualizada).
- Conferir que o Kanban ordena por `position` e invalidar as consultas do quadro/calendário após aplicar.
- Teste: renomear + reordenar mantém cada peça na mesma etapa (pela chave) e muda a ordem exibida.
- MASTER-first: nova versão, delta, `master:check`. Sem publicar.
