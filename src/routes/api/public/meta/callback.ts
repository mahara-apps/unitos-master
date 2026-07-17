import { createFileRoute } from "@tanstack/react-router";

/**
 * Meta OAuth landing (public). Meta redirects the browser here with
 * `?code=...&state=...`. State is an HMAC-signed token — no DB row required.
 * Persists one row per Page into `social_connections`.
 */
export const Route = createFileRoute("/api/public/meta/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const stateToken = url.searchParams.get("state");
        const errorReason =
          url.searchParams.get("error_reason") ||
          url.searchParams.get("error_description") ||
          url.searchParams.get("error");

        if (errorReason) return htmlResult({ ok: false, error: errorReason });
        if (!code || !stateToken)
          return htmlResult({ ok: false, error: "Missing code or state" });

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { MetaProvider, MetaGraphError, verifyOAuthState } = await import(
          "@/lib/meta/provider.server"
        );
        const { encryptCredential } = await import(
          "@/lib/credentials-crypto.server"
        );

        // 1) Verify signed state (CSRF + brand/user context).
        let state;
        try {
          state = await verifyOAuthState(stateToken);
        } catch (err) {
          return htmlResult({
            ok: false,
            error: err instanceof Error ? err.message : "Invalid state",
          });
        }

        try {
          const provider = new MetaProvider();

          // 2) code -> short-lived -> long-lived user token
          const shortLived = await provider.exchangeCode(code);
          const longLived = await provider.exchangeForLongLivedUserToken(
            shortLived.accessToken,
          );

          // 3) Identify Meta user + list Pages/IG assets
          const me = await provider.getMe(longLived.accessToken);
          const pages = await provider.listPagesWithInstagram(longLived.accessToken);
          if (pages.length === 0) {
            return htmlResult({
              ok: false,
              error:
                "Nenhuma Página do Facebook encontrada. Verifique se você é admin de ao menos uma Página.",
            });
          }

          // 4) Upsert one social_connections row per Page
          const now = new Date().toISOString();
          for (const page of pages) {
            const ciphertext = await encryptCredential(page.pageAccessToken);
            const { error: upErr } = await supabaseAdmin
              .from("social_connections")
              .upsert(
                {
                  brand_id: state.brandId,
                  provider: "meta",
                  external_id: page.pageId,
                  external_name: page.pageName,
                  account_id: page.instagramBusinessId ?? null,
                  account_username: page.instagramUsername ?? null,
                  owner_external_id: me.id,
                  owner_name: me.name ?? null,
                  access_token_ciphertext: ciphertext,
                  scopes: [],
                  status: "active",
                  last_error: null,
                  last_synced_at: now,
                  token_expires_at:
                    longLived.expiresAt?.toISOString() ?? null,
                  metadata: {
                    category: page.category ?? null,
                    tasks: page.tasks ?? [],
                    linked_at: now,
                  },
                  created_by: state.userId,
                },
                { onConflict: "brand_id,provider,external_id" },
              );
            if (upErr) throw upErr;
          }

          return htmlResult({
            ok: true,
            message: `${pages.length} página(s) conectadas`,
            redirectTo: state.redirectTo ?? "/connections",
          });
        } catch (err) {
          const msg =
            err instanceof MetaGraphError
              ? `Meta: ${err.message}`
              : err instanceof Error
                ? err.message
                : "Erro desconhecido";
          return htmlResult({ ok: false, error: msg });
        }
      },
    },
  },
});

function htmlResult(result: {
  ok: boolean;
  message?: string;
  error?: string;
  redirectTo?: string;
}): Response {
  const target = result.redirectTo ?? "/connections";
  const title = result.ok ? "Meta conectada" : "Falha ao conectar Meta";
  const detail = result.ok
    ? (result.message ?? "Conexão concluída.")
    : (result.error ?? "Tente novamente.");
  const body = `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0b0e; color: #f4f4f5; }
  .card { max-width: 420px; padding: 32px; border: 1px solid #27272a; border-radius: 16px; background: #111114; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  p { color: #a1a1aa; font-size: 14px; margin: 0 0 20px; }
  a { display: inline-block; padding: 10px 16px; background: ${result.ok ? "#22c55e" : "#ef4444"}; color: #0b0b0e; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px; }
</style>
</head><body>
<div class="card">
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(detail)}</p>
  <a href="${escapeAttr(target)}">Voltar ao app</a>
</div>
<script>
  try {
    if (window.opener) {
      window.opener.postMessage(${JSON.stringify({ source: "meta-oauth", ok: result.ok, error: result.error, message: result.message })}, "*");
      setTimeout(() => window.close(), 400);
    } else {
      setTimeout(() => { window.location.href = ${JSON.stringify(target)}; }, 1500);
    }
  } catch (e) {}
</script>
</body></html>`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}