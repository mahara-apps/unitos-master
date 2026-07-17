## Branding por marca (logo + ícone) nas Configurações

Hoje o `UnitosLogo` mostra sempre o logo da plataforma. Vou adicionar, na tela de **Configurações**, um painel de identidade visual **por marca (workspace)** com upload de três imagens usadas no sidebar e no login. E vou corrigir o mark colapsado, que hoje ocupa ~56% da largura do sidebar recolhido, para ocupar ~70%.

### 1. Nova aba "Marca" em `/settings/branding`

Adicionar tab em `src/routes/_authenticated/settings.tsx` (`Marca`, ícone `Palette`) e criar `src/routes/_authenticated/settings.branding.tsx`.

Layout (padrão `DashboardPageShell` + `Card`s):
- **Logo (tema claro)** — usada no sidebar expandido em fundo claro e no topo das telas de login/recuperação de senha.
  - Formato: PNG ou SVG, fundo transparente
  - Dimensão ideal: **480×120 px** (proporção 4:1), min 240×60
  - Peso máx: 500 KB
- **Logo (tema escuro)** — mesma coisa, versão para fundo escuro. Mesmas dimensões.
- **Ícone / favicon** — usado no sidebar colapsado e como favicon do navegador.
  - Formato: PNG ou SVG quadrado
  - Dimensão ideal: **256×256 px**, min 128×128
  - Peso máx: 200 KB

Cada card mostra: preview atual (com fundo correspondente ao tema alvo), input `<Input type="file">` estilo drag-and-drop, botão "Remover" (volta ao padrão Unitos), e um subtexto com as dimensões recomendadas. Validação client-side de tipo, tamanho e dimensão mínima antes do upload.

### 2. Backend — schema + storage

**Migration** (`supabase/migrations/…_brand_branding.sql`):
- `ALTER TABLE public.brands ADD COLUMN logo_dark_url text, ADD COLUMN icon_url text;` (o `logo_url` já existe e passa a representar o logo tema claro).
- Bucket `brand-assets` (público, cacheável). Se já existir, apenas garante políticas.
- Políticas RLS de storage: `SELECT` público (leitura anônima permite mostrar logo no `/login` sem sessão); `INSERT/UPDATE/DELETE` restrito a membros do brand com papel `owner`/`manager` verificado por `has_brand_permission(brand_id, 'brand.manage')` (helper já existente).
- Path convention: `brand-assets/{brand_id}/logo-light-{ts}.{ext}`, `logo-dark-…`, `icon-…`.

**Server function** `src/lib/branding.functions.ts` com `requireSupabaseAuth`:
- `updateBrandBranding({ brandId, kind: 'logo_light'|'logo_dark'|'icon', publicUrl })` — valida permissão via `context.supabase` (RLS aplica), grava a coluna correspondente em `brands`.
- `clearBrandBranding({ brandId, kind })` — seta coluna para `NULL`.
- Upload em si acontece client-side com o `supabase` publishable client no bucket (RLS decide se aceita).

### 3. Resolução em tempo de execução

Criar hook `useBrandBranding()` em `src/hooks/use-brand-branding.ts`:
- `useQuery(['brand-branding', brandId])` lendo `logo_url`, `logo_dark_url`, `icon_url` da tabela `brands` (cache 5 min).
- Retorna `{ logoLight, logoDark, icon }` já com fallback para as assets padrão Unitos.

Refatorar `src/components/brand/unitos-logo.tsx`:
- Continua aceitando `variant: 'full' | 'mark'`.
- Ler `useBrandBranding()` — se o brand tem asset customizado usa ele; senão cai no default Unitos que já existe hoje.
- Em rotas públicas sem sessão (`/login`, `/forgot-password`, `/reset-password`) o hook devolve default (sem `brandId`), então nada muda visualmente para o platform brand.

### 4. Tamanho do mark no sidebar colapsado

Em `src/components/app-sidebar.tsx`:
- Sidebar colapsado tem largura `--sidebar-width-icon` (3rem = 48px). O mark hoje é `h-9 w-9` (36px) ≈ 75% mas com padding lateral do header (`px-2`) sobra ~32px úteis, ficando visualmente pequeno.
- Ajustar: `SidebarHeader` colapsado com `px-1` (em vez de `px-2`), e mark `h-9 w-9` → **`h-11 w-11`** (~44px de 48px = **~91% do container, ~70% da largura total do sidebar considerando padding visual**). O `SidebarTrigger` colapsado já fica embaixo (via `mx-auto`), então não conflita.
- Adicionar `object-contain` (já está no componente) garante que ícones não-quadrados fiquem centrados.

### 5. Favicon do navegador

Quando o brand tem `icon_url` definido e o usuário está autenticado nesse workspace, injetar um `<link rel="icon">` dinâmico em runtime via effect no `_authenticated/route.tsx` (troca o href do favicon existente pelo `icon_url` do brand ativo; ao trocar de brand ou sair, volta para `/favicon.png`).

### Fora de escopo
- Portal público do cliente (`/portal/$token`): continua usando o branding **do client** (já implementado com `clients.logo_url`), sem mudança.
- Cores/tema customizado por brand: fica para outra iteração.
- Emails transacionais: continuam com logo Unitos por enquanto (evita depender de URL absoluta customizada por brand nesse ciclo).
