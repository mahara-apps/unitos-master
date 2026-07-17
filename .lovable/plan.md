## Objetivo
Substituir o placeholder atual (quadrado indigo com ícone `Sparkles` + texto "Unitos") pela logomarca oficial nas telas de login e na sidebar, e atualizar o favicon do sistema.

## Assets
Enviar os 3 arquivos como **Lovable Assets** (CDN) para não inchar o repo, exceto o favicon (que precisa estar em `public/`):

| Origem (upload) | Destino |
|---|---|
| `logo_unitos_tema_claro.png` (logo escura, para fundo claro) | `src/assets/logo-unitos-light.png.asset.json` |
| `logo_unitos_tema_escuro.png` (logo clara, para fundo escuro) | `src/assets/logo-unitos-dark.png.asset.json` |
| `favicon-unitos.png` | `public/favicon.png` (copiado direto) + remover `public/favicon.ico` |

Criar um wrapper `src/components/brand/unitos-logo.tsx` que escolhe a variante conforme o tema atual (usa `useTheme` já existente no `ThemeProvider`), aceitando props `variant: "full" | "mark"` e `className`. Renderiza um `<img>` com `alt="Unitos"` e ativa `loading="eager"` só no login.

## Alterações por tela

### 1. Sidebar — `src/components/app-sidebar.tsx`
- Substituir o bloco do header (linhas 91-102): remover o `<span>` com `Sparkles` + o texto "Unitos".
- Estado expandido: renderizar `<UnitosLogo variant="full" className="h-6 w-auto" />` (logo completa com wordmark).
- Estado colapsado (`group-data-[collapsible=icon]`): renderizar apenas o ícone `U` — `<UnitosLogo variant="mark" className="h-7 w-7" />` usando o mesmo PNG mas com `object-contain` cortado via CSS, OU uma versão só do símbolo (extraída via crop no componente com `object-position`). Preferência: usar o `favicon-unitos.png` como "mark" no estado colapsado (já é o U isolado).
- Remover import de `Sparkles`.

### 2. Login — `src/components/login-form.tsx` (linhas 100-108)
- Substituir o `<h1>Unitos</h1>` por `<UnitosLogo variant="full" className="mx-auto h-10 w-auto" />`.
- Manter o subtítulo "Entre ou crie sua conta…".

### 3. Forgot password / Reset password
- Aplicar o mesmo padrão de logo no topo se houver bloco de título análogo (verificar arquivos e reaproveitar componente).

### 4. Favicon — `src/routes/__root.tsx`
- Adicionar `{ rel: "icon", type: "image/png", href: "/favicon.png" }` no `head().links` do root route.
- Executar `rm public/favicon.ico` para não servir o ícone padrão da Lovable.

## Detalhes técnicos
- `UnitosLogo` importa os dois `.asset.json` e resolve a URL conforme `theme === "dark"` (fallback: system → checar `matchMedia`).
- Como as duas versões diferem só no contraste do miolo do "U" e do subtítulo, o switch de tema garante legibilidade em ambos.
- Nenhuma mudança em rotas ou lógica de auth. Nenhuma migration.

## Fora de escopo
- Redesenhar o layout do login ou da sidebar.
- Ajustar cores do design system para bater com o verde-limão do logo (posso propor num passe seguinte se quiser).
