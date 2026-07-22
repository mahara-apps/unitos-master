
## Diagnóstico

O modal **Novo Cliente** (`quick-create-customer-drawer.tsx`) persiste 5 campos em `clients`: `name`, `niche`, `color`, `logo_url` e `socials.instagram`. Já o formulário **Cérebro da Marca › Identidade** (`briefing-workspace.tsx` → `IdentidadeTab`) só exibe **1 desses 5 dados** (o `Nome`, e ainda em input desabilitado). Nicho, cor da marca, Instagram e a pré-visualização do logo simplesmente não aparecem — mesmo com `getBrandHub` já retornando todos esses campos no payload (`BrandHubClient` inclui `niche`, `color`, `logo_url`, `logo_secondary_url`, `favicon_url`).

Outras inconsistências confirmadas nessa área:

1. **Logo sem preview**: `AssetSlot` sempre mostra o dropzone; quando `currentUrl` existe deveria renderizar a imagem com botão "trocar/remover" (hoje o usuário acha que o upload do modal se perdeu).
2. **Nicho duplicado sem espelho**: existe em `Cadastro` (basic-info-tab) e é usado pelo `buildStrategyBriefing()`, mas não aparece nem como leitura no Cérebro.
3. **Instagram do modal invisível**: `socials.instagram` é salvo em `clients.socials` e usado por `channels-tab`, mas o Cérebro não o mostra nem o oferece como semente para "concorrentes/handles".
4. **Cor da marca perdida**: `color` fica só no avatar do sidebar; o Cérebro não a exibe, e a `palette` do `brand_hub` inicia vazia mesmo tendo a cor do onboarding disponível.
5. **`updated_at` do cliente**: `getBrandHub` devolve `clients.updated_at`, mas ao salvar em `basic-info-tab` (Cadastro) a query `["brand-hub", brandId, clientId]` não é invalidada, então mudanças de Nome/Nicho/Instagram só aparecem no Cérebro após F5.
6. **Nome "vazio" no screenshot**: o input renderiza `client.name` diretamente, mas o form já pode ter carregado antes do `hubQ.data` estabilizar; em recarregamentos rápidos o valor pisca vazio. Precisa cair para skeleton enquanto `hubQ.isPending`.

Escopo desta correção: **apenas Cérebro da Marca › Identidade** e a ponte com o Cadastro/modal. Sem tocar em pipeline de IA, tabs de Produto/Público/Concorrentes/etc.

## Mudanças

### 1. `src/components/brand-hub/briefing-workspace.tsx` — `IdentidadeTab`
- Skeleton enquanto `hubQ.isPending || !form` (evita "Nome vazio" no primeiro paint).
- Novo bloco **"Cadastro rápido"** (grid 4 colunas, read-only, com link "Editar em Cadastro") mostrando:
  - **Nome** (`client.name`)
  - **Nicho** (`client.niche` ou placeholder "—")
  - **Instagram** (de `client.socials.instagram`, com ícone + link `instagram.com/handle`)
  - **Cor da marca** (swatch `client.color` + hex)
- Manter os textareas Missão / Posicionamento / Valores / Tom de voz como estão hoje.
- Quando `client.color` existe e `form.palette` está vazia, sugerir botão "Adicionar cor da marca à paleta" (um clique, sem auto-save silencioso).

### 2. `src/components/brand-hub/briefing-workspace.tsx` — `AssetSlot`
- Se `currentUrl` presente, renderizar `<img>` (thumb 88×88, `object-contain`, fundo xadrez para transparência) + ações "Trocar" e "Remover" (a remoção já existe via `updateBrandVisuals`, só exposta).
- Se ausente, manter dropzone atual.

### 3. `src/components/customer/basic-info-tab.tsx`
- Após `mutation.onSuccess`, invalidar também `["brand-hub", brandId, clientId]` além do que já invalida — assim Nome/Nicho/Instagram/logo editados no Cadastro refletem imediatamente no Cérebro.

### 4. `src/components/customer/quick-create-customer-drawer.tsx`
- Nenhuma mudança de schema. Só garantir que o `onCreated` navegue com `?tab=cerebro` opcional (fora de escopo; deixar como está — o onboarding=1 já cobre).

## Diagrama do fluxo de dados

```text
Modal Novo Cliente
   │ name, niche, color, logo_url, socials.instagram
   ▼
clients (Supabase)
   │
   ├── getBrandHub ──► BriefingWorkspace
   │                     ├─ Cadastro rápido (novo): name, niche, instagram, color, logo
   │                     └─ Identidade (existente): missão, posicionamento, valores, tom
   │
   └── getClient ────► BasicInfoTab (Cadastro)
                          └─ onSuccess → invalida [brand-hub] (novo)
```

## Fora deste plano (posso abrir plano separado depois)

- Auditoria completa das outras abas (Produto, Público, Concorrentes, Estética, Volumetria, Documentos, Estratégia IA, Personas, SWOT) e sua consistência com o Brain.
- Migração para unificar Nicho/Instagram em um único ponto de edição (hoje moram em Cadastro; se quiser, mover a edição para dentro do Cérebro e aposentar a aba Cadastro).
- Seed automático de `brand_hub.palette` a partir de `clients.color` no `createClient` do servidor.

Confirma este recorte para eu implementar?
