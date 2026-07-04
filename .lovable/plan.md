## Objetivo
Implementar o fluxo completo de recuperação de senha, seguindo o padrão Supabase (mesmo que o login atual ainda seja mock — a recuperação já pode chamar o Supabase real, pois o cliente está configurado).

## Rotas novas

1. **`/forgot-password`** (`src/routes/forgot-password.tsx`) — full-screen, mesmo visual do login.
   - Formulário: email (Zod validado).
   - Chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })`.
   - Estado de sucesso: mensagem "Se este email existir, você receberá as instruções em instantes" (evita enumeração de contas) + botão voltar para `/login`.
   - Toast de erro genérico em caso de falha de rede.

2. **`/reset-password`** (`src/routes/reset-password.tsx`) — full-screen, público (fora de `_authenticated`).
   - Detecta `type=recovery` no `window.location.hash` (Supabase envia via hash). Se ausente, mostra estado "Link inválido ou expirado" com link para `/forgot-password`.
   - Registra `supabase.auth.onAuthStateChange` para capturar o evento `PASSWORD_RECOVERY` que hidrata a sessão temporária.
   - Formulário: nova senha + confirmação (Zod: min 8, max 72, campos iguais, toggle mostrar/ocultar reutilizando o padrão do `LoginForm`).
   - Submit: `supabase.auth.updateUser({ password })`. Em sucesso: toast + `navigate({ to: "/login" })`. Em erro: toast com mensagem do Supabase.

## Ajustes na tela de login

- Em `src/components/login-form.tsx`, trocar o `Link to="/login"` do "Esqueci minha senha" por `Link to="/forgot-password"`.

## Componente compartilhado

Extrair um pequeno `AuthShell` (`src/features/auth/auth-shell.tsx`) opcional para reaproveitar o wrapper visual (fundo radial + card centralizado) entre `/login`, `/forgot-password` e `/reset-password`. Se preferir manter simples nesta primeira entrega, replicar o wrapper inline — decisão de implementação.

## SEO / metadata

Cada nova rota define `head()` com `title`, `description`, `og:title`, `og:description` e `twitter:card` próprios ("Recuperar senha — NexusFlow" / "Definir nova senha — NexusFlow"), sem `og:image` (páginas utilitárias).

## Fora de escopo
- Integração real do submit do `/login` com `signInWithPassword` (o login continua mock nesta entrega, conforme está hoje).
- Templates de e-mail customizados (usa o padrão do Supabase por enquanto; podemos escalar para `scaffold_auth_email_templates` depois se quiser branding próprio).
- Rota `_authenticated` — só páginas públicas.

## Configuração Supabase (ação do usuário após deploy)
No painel do Supabase, adicionar `https://<dominio>/reset-password` à lista de **Redirect URLs** em Authentication → URL Configuration para o link do e-mail funcionar em produção. Em preview/local o `window.location.origin` já cobre.
