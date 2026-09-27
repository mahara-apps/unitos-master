import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callRpc } from "@/lib/supabase-rpc";

export const duplicateProjectFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    brandId: z.string().uuid(), projectId: z.string().uuid(), requestId: z.string().uuid(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await callRpc<string>(context.supabase, "duplicate_project", {
      _brand_id: data.brandId, _project_id: data.projectId, _request_id: data.requestId,
    });
    if (error) throw new Error(error.message);
    if (!id) throw new Error("Não foi possível duplicar o projeto.");
    return { id };
  });