## Objetivo
Criar uma tela de login estática e moderna em `/login`, com UI/UX inspirada em Stripe/Supabase. Sem habilitar Lovable Cloud, sem social login, sem confirmação por email. A integração real com Supabase será feita externamente pelo usuário depois.

## Escopo
- Nova rota `/login` (`src/routes/login.tsx`) com `head()` próprio (title/description/OG).
- Componente `LoginForm` em `src/components/login-form.tsx`.
- Sem lógica de autenticação real — `onSubmit` valida com Zod e apenas exibe um toast (`sonner`) com os dados. Comentário `// TODO: integrar com Supabase externo` no handler.
- Rota `/` ganha um link "Entrar" apontando para `/login` (mínimo para navegar).

## Campos e comportamento
- **Nome** — input texto, obrigatório, 2–80 chars.
- **Email** — input email, obrigatório, validação de formato.
- **Senha** — input com toggle de visibilidade (ícone `Eye` / `EyeOff` da lucide) via botão dentro do input.
- **Lembrar-me** — `Checkbox` shadcn + label.
- **Esqueci minha senha** — link à direita da label da senha, `to="/login"` como placeholder (não cria página nova).
- Botão submit "Entrar" ocupando largura total, estado `loading` com spinner.
- Validação com `react-hook-form` + `zod` + componentes `Form*` do shadcn já existentes.
- Mensagens de erro inline abaixo de cada campo.

## Design (Stripe/Supabase)
- Layout centralizado, card único com largura ~400px, sombra suave, borda sutil, radius médio.
- Fundo com gradient sutil usando tokens semânticos (`--background`, `--muted`) — sem cores hardcoded.
- Tipografia: título "Entrar na sua conta" + subtítulo curto.
- Espaçamento generoso, inputs com altura confortável (h-11), foco com ring do design system.
- Rodapé do card: "Não tem conta? Criar conta" (link placeholder para `/login`).
- Tokens novos em `src/styles.css` se necessário (ex: `--gradient-auth`, `--shadow-auth`) via `@theme inline`. Sem tocar em fontes remotas.

## Arquivos
- Criar: `src/routes/login.tsx`, `src/components/login-form.tsx`.
- Editar: `src/routes/index.tsx` (adicionar link "Entrar"), `src/routes/__root.tsx` (atualizar title/description default do app), possivelmente `src/styles.css` (tokens de auth).
- Sem novas dependências — `react-hook-form`, `zod`, `sonner`, `lucide-react` e shadcn `Form/Input/Button/Checkbox/Label` já estão no projeto.

## Fora do escopo
- Rota `/register` e `/forgot-password` reais.
- Integração com Supabase (cliente, sessão, RLS) — será feita externamente pelo usuário.
- Proteção de rotas / layout `_authenticated`.
