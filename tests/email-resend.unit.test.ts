// Resend por instalação: estado exibido e envio usam exatamente a mesma fonte.
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.BRAND_CREDENTIALS_SECRET ??= "test-secret-para-cifra-de-credenciais";

const state = vi.hoisted(() => ({
  credential: null as null | {
    ciphertext: string;
    masked: string;
    validation_status: "pending" | "ready" | "action_required";
    validation_code: string | null;
  },
  settings: { emailFrom: "contato@dominio.com" as string | null, emailFromName: null as string | null },
}));

vi.mock("@/lib/installation-settings.server", () => ({
  getInstallationSettings: vi.fn(async () => state.settings),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.credential, error: null }) }),
      }),
    }),
  },
}));

const BRAND = "11111111-1111-4111-8111-111111111111";
const appClient = {
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { name: "Unitos" } }) }),
    }),
  }),
} as never;

async function setCredential(key: string, status: "pending" | "ready" | "action_required" = "ready") {
  const { encryptCredential, maskCredential } = await import("@/lib/credentials-crypto.server");
  state.credential = {
    ciphertext: await encryptCredential(key),
    masked: maskCredential(key),
    validation_status: status,
    validation_code: status === "ready" ? "pronto" : "dominio_nao_verificado",
  };
}

async function mod() {
  return import("@/lib/email/resend.server");
}

describe("configuração Resend da instalação", () => {
  beforeEach(() => {
    state.credential = null;
    state.settings.emailFrom = "contato@dominio.com";
    state.settings.emailFromName = null;
    vi.restoreAllMocks();
  });

  it("usa apenas a credencial protegida e o remetente da instalação", async () => {
    const key = "re_test_abcdef123456";
    await setCredential(key);
    const { resolveResendConfig, resolveResendStatus } = await mod();
    const config = await resolveResendConfig(appClient, BRAND);
    const status = await resolveResendStatus(appClient, BRAND);
    expect(config).toMatchObject({ apiKey: key, source: "installation", validationState: "ready" });
    expect(status).toMatchObject({ configured: true, state: "ready", from: config?.from });
    expect(status.masked).not.toContain(key);
  });

  it("não usa RESEND_API_KEY nem credencial legada como fallback", async () => {
    process.env.RESEND_API_KEY = "re_legacy_must_not_be_used";
    const { resolveResendStatus } = await mod();
    await expect(resolveResendStatus(appClient, BRAND)).resolves.toMatchObject({
      configured: false,
      state: "not_configured",
      reason: "resend_nao_configurado",
    });
    delete process.env.RESEND_API_KEY;
  });

  it("distingue remetente ausente de credencial ausente", async () => {
    await setCredential("re_sender_missing");
    state.settings.emailFrom = null;
    const { resolveResendStatus } = await mod();
    await expect(resolveResendStatus(appClient, BRAND)).resolves.toMatchObject({
      configured: false,
      state: "action_required",
      reason: "remetente_instalacao_nao_configurado",
    });
  });

  it("expõe domínio pendente sem apagar a configuração", async () => {
    await setCredential("re_domain_pending", "action_required");
    const { resolveResendStatus } = await mod();
    await expect(resolveResendStatus(appClient, BRAND)).resolves.toMatchObject({
      configured: true,
      state: "action_required",
      reason: "dominio_remetente_pendente",
    });
  });

  it("status pronto e envio usam o mesmo remetente", async () => {
    await setCredential("re_valid_key_000111");
    const captured: { from?: string } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        captured.from = JSON.parse(init.body).from;
        return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
      }),
    );
    const { resolveResendStatus, sendBrandEmail } = await mod();
    const status = await resolveResendStatus(appClient, BRAND);
    const sent = await sendBrandEmail(appClient, BRAND, {
      to: "x@y.com",
      subject: "Teste",
      html: "<p>ok</p>",
    });
    expect(sent.sent).toBe(true);
    expect(captured.from).toBe(status.from);
  });

  it("valida chave e domínio sem enviar mensagem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ name: "dominio.com", status: "verified" }] }), {
          status: 200,
        }),
      ),
    );
    const { validateResendConfiguration } = await mod();
    await expect(validateResendConfiguration("re_valid", "dominio.com")).resolves.toMatchObject({
      status: "ready",
      code: "pronto",
    });
  });
});

describe("sanitizeProviderError", () => {
  it("remove chaves e limita o tamanho", async () => {
    const { sanitizeProviderError } = await mod();
    const out = sanitizeProviderError(
      422,
      JSON.stringify({ message: "invalid from; key re_abc123456789 used" }),
    );
    expect(out).toContain("provider_422");
    expect(out).not.toContain("re_abc123456789");
    expect(out).toContain("[redacted]");
  });

  it("distingue chave inválida, domínio não verificado e falta de permissão", async () => {
    const { sanitizeProviderError } = await mod();
    expect(sanitizeProviderError(401, "unauthorized")).toBe("credencial_invalida");
    expect(
      sanitizeProviderError(403, '{"message":"The casa8agencia.com domain is not verified"}'),
    ).toBe("dominio_remetente_nao_verificado");
    expect(
      sanitizeProviderError(
        403,
        '{"message":"You can only send testing emails to your own email address"}',
      ),
    ).toBe("conta_resend_em_modo_teste");
    expect(
      sanitizeProviderError(
        403,
        '{"message":"You can only send testing emails to your own email address. To send emails to other recipients, please verify a domain at resend.com/domains"}',
      ),
    ).toBe("conta_resend_em_modo_teste");
    expect(sanitizeProviderError(403, "forbidden")).toBe("resend_sem_permissao_de_envio");
  });
});

describe("sendResendEmail — roteamento de chave", () => {
  const msg = { to: "a@b.com", subject: "oi", html: "<p>oi</p>" };

  it("chave re_ vai direto ao Resend mesmo com LOVABLE_API_KEY presente", async () => {
    process.env.LOVABLE_API_KEY = "lov_test";
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ id: "1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { sendResendEmail } = await import("@/lib/email/resend.server");
    const out = await sendResendEmail(
      { apiKey: "re_abc123456", from: "Unitos <a@b.com>", source: "brand", masked: null },
      msg,
    );
    expect(out.sent).toBe(true);
    expect(calls).toEqual(["https://api.resend.com/emails"]);
    vi.unstubAllGlobals();
  });

  it("connection key usa gateway e cai para o Resend em 401", async () => {
    process.env.LOVABLE_API_KEY = "lov_test";
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      calls.push(url);
      return url.includes("connector-gateway")
        ? new Response("unauthorized", { status: 401 })
        : new Response(JSON.stringify({ id: "1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { sendResendEmail } = await import("@/lib/email/resend.server");
    const out = await sendResendEmail(
      { apiKey: "conn_abc123", from: "Unitos <a@b.com>", source: "brand", masked: null },
      msg,
    );
    expect(out.sent).toBe(true);
    expect(calls[0]).toContain("connector-gateway");
    expect(calls[1]).toBe("https://api.resend.com/emails");
    vi.unstubAllGlobals();
  });
});
