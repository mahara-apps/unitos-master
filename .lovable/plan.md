# Roteiro automático para Reels

## O que já existe (confirmado no código)
- Quando a peça é **Reels** (ou outro vídeo: TikTok, Shorts, YouTube), os agentes já escrevem o roteiro sozinhos **antes** da legenda. O roteiro é salvo no mesmo campo que aparece na aba **Roteiro**.
- O roteiro também serve de base para a legenda.

## Por que a peça da print está vazia
A peça "Perguntas Frequentes: Diagnóstico LUNY7 em 15 Minutos" mostra **"Geração bloqueada — verificar configuração"**. É o mesmo erro de limite de IA dos registros de hoje (`ai_budget_check_failed`). Os agentes pararam já no roteiro, que é o primeiro passo, e nada foi escrito. Esse defeito está corrigido no MASTER 1.4.79, que ainda não foi publicado.

## O que será ajustado
1. **Falha do roteiro não derruba a peça inteira.** Hoje, se o roteiro falha, a geração para e a legenda também fica sem texto. Passa a ser como no carrossel: a legenda continua sendo escrita e a peça fica marcada como "roteiro pendente", para refazer depois.
2. **Aba Roteiro com aviso claro.** Em peça de vídeo com o roteiro vazio, a aba mostra o texto "O roteiro é escrito pelos agentes. Clique em Refazer para gerar.", em vez de ficar só em branco.
3. **Carrossel não repete o texto na aba Roteiro.** No carrossel, os textos das artes já aparecem no bloco próprio. A aba Roteiro passa a mostrar só o aviso de onde eles estão.

## Detalhes técnicos
- `src/lib/post-agents.server.ts`: no `catch` do passo `script`, se o erro não for de configuração/orçamento (`kind !== "config"`, já que nesse caso a legenda falharia também), registrar o passo em `degraded` e seguir para a legenda, sem o `return failed`. Erros de configuração continuam parando a peça (fail-closed).
- `src/components/content/task-dialog.tsx`: placeholder ou aviso na aba Roteiro quando o formato é de vídeo e `script` está vazio; no carrossel, um aviso apontando para "Textos das artes".
- Teste unitário: uma falha não-config do roteiro mantém a legenda; uma falha de configuração continua bloqueando.
- MASTER-first: só código → `build_delta.py`, versão **1.4.80** em `delta_version.txt` e `MASTER_RELEASE_VERSION`, `bun run master:check`, suíte local.
- Para as peças atuais: publicar o MASTER, autorizar a atualização na Casa 8 e clicar em "Refazer". Isso só acontece com a sua autorização.
