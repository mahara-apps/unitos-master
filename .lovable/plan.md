# Corrigir erro ao convidar/adicionar/criar usuário

O toast diz "Missing Supabase environment variable(s): **SUPABASE_SERVICE_ROLE_KEY**". O projeto está em Supabase externo (não Lovable Cloud), então esse segredo precisa ser adicionado manualmente — sem ele **nenhuma** operação admin funciona (Convidar, Adicionar existente e Criar usuário todas usam `supabaseAdmin` via `auth.admin.createUser` / `listUsers`).

## Passos

1. Chamar `add_secret` pedindo o `SUPABASE_SERVICE_ROLE_KEY`, com instruções onde encontrar (Supabase Dashboard → Project Settings → API → `service_role` key).
2. Nenhuma mudança de código: `src/integrations/supabase/client.server.ts` já lê `process.env.SUPABASE_SERVICE_ROLE_KEY` corretamente e as três server functions (`inviteBrandMembers`, `addExistingUserToBrand`, `provisionUser`) já importam o admin client sob demanda.
3. Após a chave chegar, publicar novamente para o worker recarregar o segredo — Convidar, Adicionar existente e Criar usuário voltam a funcionar imediatamente.

## Alternativa

Se o time preferir não expor a `service_role` key, seria necessário migrar essas operações admin para uma Edge Function no Supabase (que herda a key automaticamente) — mais trabalho e latência. Sugiro adicionar o segredo primeiro; podemos revisitar essa alternativa depois se houver política interna contra.
