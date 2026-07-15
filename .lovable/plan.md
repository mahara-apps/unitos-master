## Refatoração da tela `/brain` — Neural Canvas & Layout

### Problemas atuais
- Canvas com fundo `#000` puro quebra o padrão "Geek Sleek" (que usa `bg-card`/`bg-muted` com bordas suaves em ambos os temas).
- Nós com cores saturadas (magenta/amarelo neon/azul elétrico) com blur excessivo criam manchas borradas em vez de uma rede neural legível.
- Legenda flutuante desalinhada, sem hierarquia com o resto do sistema.
- KPIs e cards inferiores não conversam visualmente com o canvas (canvas parece um widget externo).

### O que muda

**1. Canvas Neural (`src/components/brain/neural-canvas.tsx` ou equivalente)**
- Fundo: trocar `#000` por token do sistema — usar `bg-card` com sutil `radial-gradient` a partir de `--muted` para dar profundidade sem ser preto puro.
- Borda: `border border-border rounded-xl` (mesmo padrão dos demais cards premium).
- Paleta dos nós reduzida e semântica, alinhada aos tokens OKLCH já usados no sistema:
  - Conteúdo → `--primary` (roxo do sistema)
  - Mídia Paga → `--chart-2` (azul dessaturado)
  - Mensageria → `--muted-foreground` (neutro)
  - Insights → `--chart-4` (âmbar suave)
- Reduzir `shadowBlur` de ~40 para ~12; raio dos nós menor e mais consistente.
- Linhas de conexão: `strokeStyle` com alpha baixo (~0.15) usando `--border` convertido para RGBA, em vez de branco puro.
- Nó central (usuário/agência) destacado com anel `--ring` em vez de branco sólido.

**2. Legenda**
- Mover para um rodapé interno do card do canvas, tipografia `text-xs text-muted-foreground uppercase tracking-wide`, com dots usando as mesmas cores dos nós.

**3. Coerência com PageShell**
- Envelopar canvas + KPIs num único `Card` com `CardHeader` ("Rede Neural") + `CardContent` (canvas) + `CardFooter` (legenda), seguindo o padrão dos demais módulos (Analytics, Dashboard).
- KPIs abaixo mantêm o grid atual, mas com ícones tintados na mesma paleta dos nós para amarrar visualmente.

**4. Suporte a Light/Dark mode**
- Todas as cores vindas de CSS variables — canvas re-renderiza ao trocar tema lendo `getComputedStyle(document.documentElement).getPropertyValue('--primary')` etc., dentro de um `useEffect` que escuta mudança de classe `.dark` no `html`.

### Fora do escopo
- Nenhuma mudança em lógica de ingestão, consolidação, schema `brain_*` ou server functions.
- Nenhuma mudança nos cards "Insights ativos" / "Timeline recente" além de espaçamento para casar com o novo canvas.

### Arquivos afetados
- `src/routes/_authenticated/brain.tsx` (estrutura Card + espaçamento)
- `src/components/brain/neural-canvas.tsx` (paleta, fundo, blur, tema-aware)
- Possível ajuste mínimo em `src/styles.css` se faltar token `--chart-*` aplicável.
