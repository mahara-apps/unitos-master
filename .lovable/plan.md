## Problema

O saudação do dashboard mostra `Olá, Admin!` — está pegando o `user_metadata.full_name` do auth (que muitas vezes traz o papel "Admin" ou string genérica) em vez do primeiro nome real do usuário salvo em `public.user_profiles.full_name`.

Ver `src/routes/_authenticated/dashboard.tsx` (linhas 105-118): a saudação é montada com `supabase.auth.getUser()` → `meta.full_name || meta.name || email.split("@")[0]`.

## Fix

Trocar a fonte pelo `user_profiles.full_name` (fonte canônica do perfil no app):

1. Em `AgencyMode` (e `ClientMode` se também exibir saudação — verificar) substituir o `useEffect` por:
   - `SELECT full_name FROM user_profiles WHERE id = auth.uid()` via `supabase.from("user_profiles").select("full_name").eq("id", user.id).maybeSingle()`.
   - Fallback em cascata: `profile.full_name` → `user_metadata.full_name` / `name` → parte antes do `@` do e-mail → `"Olá!"`.
   - Usa `.split(" ")[0]` (primeiro nome) e capitaliza a primeira letra caso venha em minúsculas.
2. Envolver em `useQuery(["me-first-name"])` com `staleTime` de 5 min para evitar refetch por navegação.

## Escopo

- Apenas `src/routes/_authenticated/dashboard.tsx`.
- Verificar se `ClientMode` também usa saudação; se sim, aplicar o mesmo hook compartilhado local no arquivo (`useFirstName()`).
- Sem mudanças em backend, schema ou RLS (o próprio usuário já lê seu `user_profiles` pela policy existente).

## Resultado

`Olá, {Primeiro Nome}!` refletindo o nome cadastrado em Configurações → Meu Perfil, não o papel.
