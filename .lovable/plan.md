# Roteiro do Reels + auditoria do texto que vai para o agendamento

## Parte A — Para onde vai cada texto (auditoria feita no código)

```text
Pauta / briefing  ->  Briefing interno / Briefing cliente   (só referência, nunca publicado)
Agentes           ->  Roteiro (Reels/vídeo)                  (aba Roteiro)
                  ->  Textos das artes (Carrossel)           (bloco "Textos das artes")
                  ->  Direção visual                         (para o designer)
                  ->  Legenda                                (campo Legenda)
Agendamento       ->  publica SOMENTE: Legenda + hashtags da peça (Stories: nada)
```

O que o código mostra:
- Os textos das artes do carrossel ficam no mesmo campo do roteiro, separados da legenda. Eles **não** vão para a publicação.
- O agendamento e a nova tentativa de publicação leem só a **Legenda** (e as hashtags). Briefing, roteiro, textos das artes e direção visual nunca são enviados.
- Os agentes recebem o briefing e as artes como referência e são instruídos a escrever só a legenda final, sem rótulos.

Dois riscos reais, que ainda não foram conferidos nos dados:
1. **A IA desobedecer** e colar trechos do briefing ou das artes ("Arte 1 —", "Apoio:", "Design:", "Briefing", "Público-alvo:") dentro da legenda. Hoje nada barra isso.
2. **Hashtags em dobro:** a legenda já termina com hashtags, e o agendamento acrescenta de novo as hashtags da peça.

## O que será feito
1. **Conferir na Casa 8 (somente leitura):** ler as legendas das peças geradas nos últimos 30 dias e as legendas já agendadas/publicadas, procurando trechos de briefing, de artes ou hashtags repetidas. Isso confirma se o retrabalho acontece e em quantas peças.
2. **Barreira na legenda:** se a legenda vier com trechos de briefing ou de artes, os agentes refazem a legenda uma vez. Se o problema continuar, a peça fica marcada como "legenda precisa revisão", em vez de salvar texto errado.
3. **Barreira no agendamento:** antes de agendar, a tela avisa quando a legenda contém trechos de briefing ou de artes, mostrando o que vai ser publicado. A pessoa confirma ou corrige.
4. **Hashtags sem repetição:** no agendamento, hashtags que já estão na legenda não são acrescentadas de novo.

## Parte B — Roteiro automático no Reels
- O roteiro do Reels **já é gerado automaticamente**, antes da legenda, e aparece na aba Roteiro. A peça da print está vazia porque a geração foi bloqueada pelo erro de limite de IA, já corrigido no MASTER 1.4.79, que ainda não foi publicado.
- **Ajuste:** se o roteiro falhar por um motivo que não seja de configuração, a legenda continua sendo escrita e o roteiro fica pendente, em vez de a peça ficar toda vazia.
- **Aba Roteiro:** em peça de vídeo sem roteiro, mostra "O roteiro é escrito pelos agentes. Clique em Refazer". No carrossel, aponta para "Textos das artes", sem repetir o texto.

## Detalhes técnicos
- Novo módulo puro `src/lib/caption-hygiene.ts`: `findCaptionLeaks(caption)` (marcadores `^Arte \d+ —`, `^Apoio:`, `^Design:`, `Briefing (interno|do cliente):`, `Público-alvo:`, `Direção visual:`) e `mergeHashtags(caption, tags)` (deduplica sem diferenciar maiúsculas/minúsculas).
- `post-agents.server.ts`: após a legenda, se `findCaptionLeaks` encontrar algo, refazer uma vez com instrução corretiva; se persistir, salvar em `degraded` e marcar a peça para revisão (sem publicar automaticamente). No `catch` do roteiro, `kind !== "config"` passa a registrar em `degraded` e seguir para a legenda.
- `scheduling-wizard.functions.ts` e `publish-retry.functions.ts`: usar `mergeHashtags` ao montar a legenda final. A tela de agendamento mostra o aviso de `findCaptionLeaks` antes de confirmar.
- `task-dialog.tsx`: textos de ajuda na aba Roteiro (vídeo vazio / carrossel).
- Auditoria da Casa 8 via consulta somente leitura (Management API) em `posts.copy` e `social_posts.caption`/`post_placements`, sem nenhuma escrita.
- Testes unitários: detecção de vazamento, deduplicação de hashtags e roteiro com falha não-config que mantém a legenda.
- MASTER-first: só código → `build_delta.py`, versão **1.4.80** em `delta_version.txt` e `MASTER_RELEASE_VERSION`, `bun run master:check`, suíte local. Publicação e atualização na Casa 8 só com a sua autorização.
