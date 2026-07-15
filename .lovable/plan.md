## Objetivo
Padronizar o tamanho do logo (ícone) e do texto no seletor de contexto (workspace/cliente) para bater exatamente com o cabeçalho "NexusFlow" da sidebar.

## Padrão de referência (header da sidebar)
- Container do ícone: `h-7 w-7` (28px), `rounded-md`
- Ícone interno: `h-3.5 w-3.5`
- Texto: `text-sm font-semibold tracking-tight`
- Altura da linha: 56px (h-14)

## Mudanças em `src/components/brand-client-switcher.tsx`
1. Trigger do Popover: reduzir de `h-12` para `h-11` para alinhar visualmente com o header.
2. Avatar do cliente (`CustomerAvatar`): `h-8 w-8` → `h-7 w-7`, `textClassName` `text-xs` → `text-[11px]`.
3. Placeholder do workspace (div com gradiente): `h-8 w-8` → `h-7 w-7`; `Sparkles` `h-4 w-4` → `h-3.5 w-3.5`.
4. Texto principal: manter `text-sm font-semibold`, adicionar `tracking-tight` para igualar.
5. Subtítulo (`Todas as contas` / nome do workspace): manter `text-[11px] text-muted-foreground`.

Sem alterações de lógica, apenas classes de tamanho/tipografia.
