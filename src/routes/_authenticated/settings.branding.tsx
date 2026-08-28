import { createFileRoute, redirect } from "@tanstack/react-router";

import { amISuperAdmin } from "@/lib/feature-flags.functions";

/**
 * Rota legada da identidade visual. A tela de identidade visual é exclusiva de
 * SUPER ADMIN (Administração → Identidade). Owner/Admin/Manager/User que
 * chegarem por URL direta caem em Agência (sem a aba de identidade visual).
 * O bloqueio real é no servidor: `updateBrandBranding` exige Super Admin.
 */
export const Route = createFileRoute("/_authenticated/settings/branding")({
  beforeLoad: async () => {
    const { isSuperAdmin } = await amISuperAdmin();
    throw redirect({ to: isSuperAdmin ? "/admin/identidade" : "/settings/identity" });
  },
});
