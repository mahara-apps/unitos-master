# Casa 8: falhas dos últimos 20 min + rolagem da Auditoria

## 1. As falhas de hoje (15:06 a 15:14) — diagnóstico confirmado
Os 5 registros enviados têm o mesmo erro da manhã: `ai_budget_check_failed` ("não foi possível confirmar os limites de IA"), sem ninguém logado na geração (`actor_id` nulo) e sem provedor chamado (`provider` nulo). É exatamente o defeito que a correção **1.4.78** resolve. Como o MASTER 1.4.78 ainda não foi publicado nem aplicado na Casa 8, as falhas continuam. Não é um problema novo.

Peças afetadas (cliente LUNY7):
- `59fa08f5…` (Carrossel): direção de arte, textos das artes e legenda falharam.
- `462681e2…` (Reels): roteiro falhou.
- `a29758a7…` (15:06): mesmo padrão.

Depois de publicar a 1.4.78 e clicar em "Autorizar nova atualização" na Casa 8, basta clicar em "Refazer" nessas peças. Nada foi apagado.

## 2. Auditoria sem rolagem — causa confirmada
A lista usa uma área de rolagem com altura máxima, mas o miolo dela não herda essa altura. Resultado: a lista fica cortada e não rola. Os registros existem (até 300 são buscados), só não aparecem.

O que será feito:
- Trocar por uma lista que rola de verdade, ocupando até cerca de 70% da altura da tela.
- Adicionar o botão **"Carregar mais"** no fim da lista, buscando os registros mais antigos (o servidor já suporta isso, só não era usado).
- Mostrar "Exibindo N eventos" para ficar claro quantos estão na tela.

## 3. Falhas de IA aparecem como "Info" (achado extra)
Na print, `ai_generation_failed` aparece com o ícone azul "Info". Todo evento de Ações hoje entra como Info, mesmo quando é falha. Por isso o filtro **"Erro"** não mostra essas falhas.
- Ações cujo nome termina em `_failed` (ou com `ok: false` no detalhe) passam a aparecer como **Erro**.
- Os contadores "Erros" do topo passam a contá-las.
- Nada muda no banco; é só a forma de mostrar.

## Detalhes técnicos
- `src/components/system-logs/log-viewer.tsx`: substituir `<ScrollArea className="max-h-[65vh]">` por `<div className="max-h-[70vh] overflow-y-auto rounded-lg border">`; trocar `useQuery` por `useInfiniteQuery` usando `cursor = nextCursor` da página anterior (limite 100 por página), deduplicando por `entry.id`; botão "Carregar mais" quando `hasNextPage`.
- `src/lib/logs.functions.ts` (ramo `activity`): `level = verb.endsWith("_failed") || payload.ok === false ? "error" : "info"`. O filtro por nível continua após o mapeamento, então "Erro" passa a incluí-las.
- Teste unitário: mapeamento de nível de atividade (`ai_generation_failed` → error; `stage_changed` → info).
- MASTER-first: só código (sem banco) → `build_delta.py`, `delta_version.txt` + `MASTER_RELEASE_VERSION` = **1.4.79** (leva junto 1.4.76–1.4.78), `bun run master:check`, suíte local.
- Publicação do MASTER e atualização na Casa 8 somente com sua autorização.
