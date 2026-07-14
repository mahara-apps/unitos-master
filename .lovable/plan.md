## Objetivo

Eliminar a tela "Inicialize este cliente com IA" (onboarding com colar texto do briefing) e mover a geração da estratégia para dentro do próprio **Briefing**, com um botão dedicado.

## Mudanças

### 1. Remover a tela de onboarding do fluxo do cliente
Em `src/routes/_authenticated/customers.$customerId.tsx`:
- Remover import e uso de `PipelineOnboarding`.
- Remover states `forceOnboarding` / `regenOpen` e o `AlertDialog` "Regenerate strategy?".
- Remover a condicional `showOnboarding` — a página sempre renderiza direto as Tabs (Overview, Basic, Briefing, etc.), mesmo quando ainda não há briefing.
- No `CustomerDashboard`, retirar o botão **"Regerar estratégia"** do header (prop `onRegenerate`) — a ação passa a viver dentro do Briefing.

### 2. Deletar o componente órfão
- Apagar `src/components/ai-agents/pipeline-onboarding.tsx` (não terá mais consumidores).

### 3. Botão "Gerar estratégia" dentro do Briefing
Em `src/components/brand-hub/briefing-workspace.tsx`:
- Adicionar no header do workspace um botão **"Gerar estratégia com IA"** (rótulo alterna para **"Regerar estratégia"** quando já existir voice card / personas / SWOT / pautas).
- Ao clicar, abrir `AlertDialog` de confirmação (mesmo texto do atual: artefatos anteriores viram histórico, os novos passam a ser a versão ativa).
- Ao confirmar, serializar os campos estruturados do briefing (marca, público, diferencial, objetivos, tom, concorrência, ofertas, volumetria) em um texto canônico e enviar para `POST /api/jobs/customer-pipeline` — a mesma rota que a tela removida usava, sem tocar no backend.
- Bloquear o clique quando o briefing estiver praticamente vazio (mostrar toast "Preencha o briefing antes de gerar a estratégia").
- Toast de sucesso + invalidar `["ai-jobs","active"]` — o progresso continua acompanhável pelo indicador de IA no header.

### 4. Ajustes finos
- Nenhuma mudança no backend (`/api/jobs/customer-pipeline` permanece igual).
- Nenhuma mudança nos agentes individuais em `agent-tabs.tsx` (Voice/Personas/Cohorts/SWOT continuam com seus próprios botões "Regerar").

## Resultado esperado

- A tela cheia "Onboarding · Fase 1 em segundo plano" desaparece.
- O usuário sempre entra direto no dashboard do cliente / abas.
- A geração e regeneração da estratégia acontece na aba **Briefing**, a partir dos próprios campos preenchidos ali.
