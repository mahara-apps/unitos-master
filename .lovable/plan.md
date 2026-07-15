
## Objetivo
Corrigir a demora no redirect após login e a perda de sessão em reloads, tornando o fluxo de auth previsível e sem "flash" da tela de login.

## Diagnóstico
Ao ler `src/routes/_authenticated/route.tsx`, `src/routes/login.tsx`, `src/components/login-form.tsx`, `src/routes/__root.tsx` e `src/start.ts` encontrei três causas concretas:

1. **Redirect lento após login** — `LoginForm.onSignIn` chama `signInWithPassword` e navega para `/dashboard`. O layout `_authenticated/route.tsx` faz então **dois** roundtrips seriais (`getSession()` + `getUser()`) dentro de um `useEffect` com estado `"checking"`. Enquanto isso o usuário vê o spinner "Carregando NexusFlow…" por 1–2s desnecessários.
2. **"Login não persiste"** — o layout `_authenticated` não redireciona para `/login`; ele renderiza o `LoginForm` **inline**. Em qualquer glitch de rede no `getUser()` (ou quando o token está prestes a expirar) o usuário volta a ver o formulário mesmo com sessão válida no `localStorage`, dando a sensação de que "perdeu o login". Não há também `onAuthStateChange` global, então `SIGNED_IN`/`TOKEN_REFRESHED` não invalidam o router — a UI só reage quando o `useEffect` remonta.
3. **`/login` não reconhece sessão existente** — abrir `/login` já autenticado mostra o formulário novamente (sem redirect), o que reforça a percepção de sessão perdida. Além disso, o middleware em `src/start.ts` redireciona para `/login?next=...`, mas esse `next` nunca é lido.

## Mudanças

### 1. `src/routes/_authenticated/route.tsx`
- Substituir o `useEffect` + `status` por um guard determinístico: manter a checagem client-side (é o padrão do template com `ssr: false` implícito), mas usar **apenas** `supabase.auth.getSession()` (sem `getUser()` na inicialização — `getSession()` já lê o `localStorage` sincronamente após hidratação).
- Quando `session` não existir, **redirecionar** para `/login?next=<pathname>` via `useNavigate` (ou `<Navigate />`), removendo o `LoginForm` inline.
- Assinar `supabase.auth.onAuthStateChange` para reagir a `SIGNED_OUT` (redirecionar) e `SIGNED_IN`/`TOKEN_REFRESHED` (marcar autenticado sem novo roundtrip).

### 2. `src/routes/__root.tsx`
- Adicionar um listener único de `onAuthStateChange` (filtrado a `SIGNED_IN`/`SIGNED_OUT`/`USER_UPDATED`) que chama `router.invalidate()` + `queryClient.invalidateQueries()` (sem invalidar em `SIGNED_OUT`, para evitar 401 storm), conforme o padrão canônico da integração Supabase.

### 3. `src/routes/login.tsx`
- Ler a sessão no client; se autenticado, redirecionar imediatamente para `search.next ?? "/dashboard"`.
- Aceitar `next` como search param validado.

### 4. `src/components/login-form.tsx`
- Após `signInWithPassword` bem-sucedido:
  - Ler `next` do `window.location.search` (fallback `/dashboard`).
  - Chamar `router.invalidate()` antes de `navigate({ to: next, replace: true })` para o layout `_authenticated` já enxergar a sessão sem esperar remount.
- Manter o mesmo tratamento para signup.

### 5. `src/start.ts` (menor)
- Sem mudanças funcionais; o `next=` que ele já injeta passa a ser respeitado pelas mudanças 3 e 4.

## Fora do escopo
- Não mexer em RLS, server functions, ou UI visual do formulário.
- Não migrar `/login` para dentro de `_authenticated` (é rota pública por design).

## Verificação
1. Login com credenciais válidas → redirect para `/dashboard` deve ser praticamente instantâneo (sem tela "Carregando NexusFlow…").
2. Reload em `/dashboard` autenticado → conteúdo aparece sem flash de login.
3. Abrir `/login` já autenticado → redireciona direto para `/dashboard`.
4. Sessão expirada durante RPC → `start.ts` redireciona a `/login?next=/rota-atual`; após novo login volta para a rota original.
5. Logout em outra aba (`SIGNED_OUT`) → aba ativa sai de `_authenticated` para `/login` automaticamente.
