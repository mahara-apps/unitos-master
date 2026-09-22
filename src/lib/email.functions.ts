// Estado do canal de e-mail (Resend) exposto ao app.
// Fonte única: o MESMO resolvedor usado pelo envio real
// (`src/lib/email/resend.server.ts`), garantindo que "Conectado" na UI
// signifique exatamente "envio funcionará".
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BrandInput = z.object({ brandId: z.string().uuid() });

export type EmailChannelStatus = {
  configured: boolean;
  from: string | null;
  source: "installation" | null;
  masked: string | null;
  state: "not_configured" | "pending" | "ready" | "action_required";
  reason:
    | "resend_nao_configurado"
    | "remetente_instalacao_nao_configurado"
    | "credencial_instalacao_ilegivel"
    | "dominio_remetente_pendente"
    | "validacao_resend_pendente"
    | null;
};

export const getEmailChannelStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BrandInput.parse(input))
  .handler(async ({ data, context }): Promise<EmailChannelStatus> => {
    const { assertBrandMember } = await import("@/lib/access-guard");
    await assertBrandMember(context.supabase, context.userId, data.brandId);
    const { resolveResendStatus } = await import("@/lib/email/resend.server");
    return resolveResendStatus(context.supabase, data.brandId);
  });
