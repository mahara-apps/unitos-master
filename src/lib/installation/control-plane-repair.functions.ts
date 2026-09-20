import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RpcClient } from "@/lib/access-guard";
import { assertSuperAdmin } from "@/lib/super-admin";
import { getControlPlaneRepairReport } from "./control-plane-repair-contract";

/** Somente leitura: valida autoridade e devolve o plano selado; não chama executores. */
export const getControlPlaneRepairReportFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertMasterInstallation } = await import("./manager.server");
    assertMasterInstallation();
    await assertSuperAdmin(context.supabase as unknown as RpcClient, context.userId);
    return getControlPlaneRepairReport();
  });
