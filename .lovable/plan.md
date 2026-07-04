## Objetivo
Investigar o 404 relatado em `/production` e validar navegação/rendering em todas as rotas (`/`, `/production`, `/login`, `/portal/demo`).

## Diagnóstico esperado
Sintomas prováveis a confirmar em runtime (via Playwright + console):
1. **`/production` 404** — a rota existe em `routeTree.gen.ts` como `/_app/production`, mas o layout `_app.tsx` pode não estar montando `<Outlet />` corretamente em SSR, ou há conflito porque `_app.production.tsx` renderiza seu próprio `ProductionHeader` sticky dentro do header do shell (`_app.tsx`), gerando dois headers e possivelmente quebrando o match.
2. **Hydration mismatch** já visível no console (ThemeProvider aplica `class="dark"` no `<html>` no cliente sem SSR match) — não causa 404, mas polui o log e pode disparar re-render.
3. **`_app.index.tsx`** usa `min-h-screen` dentro do shell que já tem header de 56px → overflow visual.

## Passos do plano

1. **Reproduzir com Playwright** em `/`, `/production`, `/login`, `/portal/demo`, capturando screenshot + console de cada uma para identificar exatamente onde aparece o 404 (rota não casada vs. erro de render vs. NotFoundComponent do root).

2. **Corrigir hydration do ThemeProvider** — aplicar tema apenas após montagem (`suppressHydrationWarning` no `<html>` do `RootShell` e `mounted` guard no `ThemeProvider`) para eliminar o warning e evitar re-render que pode mascarar erros reais.

3. **Ajustar `_app.production.tsx`** — remover o `ProductionHeader` duplicado (o shell já provê header com título "Produção"), mantendo apenas o `Select` de campanha + botão "Novo Post" numa toolbar interna. Remover `min-h-screen` do container (usa `flex-1` do shell).

4. **Ajustar `_app.index.tsx`** — trocar `min-h-screen` por `min-h-[calc(100vh-3.5rem)]` para respeitar o header do shell.

5. **Validar** com Playwright após as correções: cada rota deve renderizar 200, sidebar visível em `/` e `/production`, sem sidebar em `/login` e `/portal/demo`, sem warnings de hydration, navegação entre itens da sidebar funcional.

## Fora de escopo
- Redesign visual das páginas
- Autenticação real
- Alterações no Portal ou Login além de confirmar que continuam full-screen
