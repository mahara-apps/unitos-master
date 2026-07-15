## Refatorar `GenerateNewPlanDialog` — layout compacto sem scroll

Arquivo: `src/components/calendar/generate-plan-dialog.tsx`

### Objetivos
- Modal cabe inteiro em uma tela padrão (sem barra de rolagem interna).
- Linhas de canal mais compactas.
- Stepper de quantidade mais elegante que 3 controles separados.

### Mudanças

**1. Container**
- Remover `max-h-[90vh] overflow-y-auto` do `DialogContent`; manter `max-w-lg`.
- Reduzir espaçamentos internos: `gap-3` no grid principal, `py-1`.

**2. Lista de canais (mais densa)**
- Linha compacta em grid `[auto_1fr_auto]`, altura ~32px (`h-8`), padding `px-2`.
- Chip do canal com ícone menor (`h-2.5 w-2.5`), texto `text-[10px]`, sem borda extra.
- Checkbox com tamanho reduzido (`h-3.5 w-3.5`).
- Estado "off" com opacidade e chip em cinza; clicar na linha inteira liga/desliga.

**3. Stepper unificado (substitui − [input] +)**
- Um único controle segmentado, largura fixa ~96px, altura 28px:
  - Botão `−` à esquerda (borda arredondada só do lado esquerdo).
  - Número central em `tabular-nums`, editável via clique (input inline transparente, sem borda).
  - Botão `+` à direita.
- Tudo dentro de uma casca com `border rounded-md`, divisores internos sutis (`divide-x`).
- Botões desabilitam automaticamente (− quando 0, + quando 180).
- Roda do mouse sobre o número incrementa/decrementa (nice-to-have).

**4. Rodapé informativo**
- Reduzir para uma linha: `text-[11px]`, ícone `h-3 w-3`.

**5. Direcionamento extra**
- Textarea de 3 linhas → 2 linhas (`rows={2}`), fonte `text-xs`.

### Resultado esperado
- Altura total do modal ≈ 560–600px em telas ≥ 700px de altura → sem scroll.
- Lista de 7 canais ocupa ~230px (7 × 32px + gaps) contra ~360px atual.
- Selector de quantidade visualmente coeso, parece um único componente premium.

### Fora de escopo
- Backend (`channelMix` continua igual).
- Nenhuma mudança em outros arquivos.
