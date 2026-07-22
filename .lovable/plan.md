## Problema

A tabela `brand_media_assets` só tem `brand_id`. A "Biblioteca do cliente" no wizard, no composer de conteúdo e nos media plans lista **todas as mídias da marca**, então todo cliente vinculado à mesma marca vê a mesma biblioteca. Precisamos separar por `client_id`.

## Escopo

Manter compatibilidade com mídias existentes (sem `client_id` = biblioteca geral da marca) e permitir mídias específicas por cliente.

## Passos

### 1. Migração
- `ALTER TABLE public.brand_media_assets ADD COLUMN client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;`
- Index em `(brand_id, client_id, created_at desc)`.
- Atualizar RLS: permitir SELECT/INSERT/DELETE quando o usuário tem acesso à marca **e** (client_id é null **ou** o usuário tem acesso ao cliente).
- Storage path novo: `<brand_id>/<client_id>/...` para novos uploads (retrocompat: paths antigos sem client segment permanecem).

### 2. Server functions (`src/lib/brand-media.functions.ts`)
- `listBrandMediaFn`: aceitar `clientId` opcional. Quando presente, filtrar `client_id = clientId`; quando ausente, filtrar `client_id IS NULL` (biblioteca geral da marca).
- `registerBrandMediaFn`: aceitar `clientId` opcional; validar prefixo do storage path (`<brand_id>/<client_id>/` quando cliente informado).
- `deleteBrandMediaFn`: sem mudança de assinatura, mas RLS garante escopo.
- `signBrandMediaFn`: sem mudança.

### 3. Callers
- `src/components/calendar/schedule-wizard/index.tsx`: passar `clientId` para `listMedia` e para uploads via `registerMedia` + path de storage.
- `src/lib/content.functions.ts`: se o composer/content usa a biblioteca em contexto de cliente, passar `client_id` do post/task.
- `src/routes/_authenticated/media-plans.tsx` e `src/components/media-plans/create-media-plan-dialog.tsx`: passar `clientId` do plano.
- `src/lib/meta/publishing.functions.ts` e `src/routes/api/public/meta/publish-scheduled.ts`: apenas leem storage path para publicar — nenhum ajuste de filtro necessário; só verificar que o path continue válido.
- `src/routes/api/public/media/prune.ts`: revisar se prune remove por `brand_id` — manter (client_id null cobre biblioteca geral).

### 4. UI
- Rótulo permanece "Biblioteca do cliente" no wizard (já está no contexto do cliente ativo).
- Nenhuma tela nova; opcionalmente uma aba "Biblioteca da marca" fica fora do escopo desta correção.

## Verificação
- Upload em Cliente A não aparece para Cliente B na mesma marca.
- Mídias antigas (sem client_id) continuam visíveis quando nenhum `clientId` é passado (contexto de marca).
- Publicação Meta continua funcionando (signed URL depende só de storage_path).
