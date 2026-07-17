## Ajustar tamanho da logomarca Unitos

As imagens de logo enviadas têm bastante padding interno (tipografia + margens), então em `h-7`/`h-9`/`h-10` o "peso visual" fica muito menor do que o container. Vou aumentar os tamanhos renderizados e dar mais respiro no header da sidebar.

### `src/components/app-sidebar.tsx`
- `SidebarHeader`: `h-14` → `h-16` (para acomodar a logo maior sem cortar).
- Logo `full`: `h-7` → `h-10`.
- Logo `mark` (colapsado): `h-7 w-7` → `h-9 w-9`, remover `rounded-md` (a arte já vem com o quadrado preto).

### `src/components/login-form.tsx`
- Logo do topo: `h-10` → `h-14` e `mb-4` para respirar.

### `src/routes/forgot-password.tsx` e `src/routes/reset-password.tsx`
- Logo do topo: `h-9` → `h-14` (padronizar com login).

Nenhuma mudança no `UnitosLogo` em si — só nos call sites (classes Tailwind). Sem impacto em lógica/back-end.
