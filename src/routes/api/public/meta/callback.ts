import { createFileRoute } from "@tanstack/react-router";

/**
 * Public OAuth landing for Meta. Meta redirects the browser here with
 * `?code=...&state=...`. We validate the state (CSRF + brand mapping),
 * exchange the code for a long-lived user token, enumerate Pages/Instagram
 * Business accounts and upsert one row per Page into meta_connections.
 *
 * Lives under /api/public/* so it bypasses the auth wall — the state token
 * itself authenticates the callback (short TTL + single use).
 */
export const Route = createFileRoute("/api/public/meta/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorReason =
          url.searchParams.get("error_reason") ||
          url.searchParams.get("error_description") ||
          url.searchParams.get("error");

        if (errorReason) return htmlResult({ ok: false, error: errorReason });
        if (!code || !state) return htmlResult({ ok: false, error: "Missing code or state" });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { MetaProvider, MetaGraphError } = await import(
          "@/lib/meta/provider.server"
        );
        const { encryptCredential } = await import(
          "@/lib/credentials-crypto.server"
        );

        // 1) Consume the state row (CSRF + brand/user context).
        const { data: stateRow, error: stateErr } = await supabaseAdmin
          .from("meta_oauth_states")
          .select("state, brand_id, user_id, redirect_to, expires_at")
          .eq("state", state)
          .maybeSingle();
        if (stateErr) return htmlResult({ ok: false, error: stateErr.message });
        if (!stateRow) return htmlResult({ ok: false, error: "Invalid or expired state" });
        if (new Date(stateRow.expires_at) < new Date()) {
          await supabaseAdmin.from("meta_oauth_states").delete().eq("state", state);
          return htmlResult({ ok: false, error: "State expired, try again" });
        }
        // Single-use.
        await supabaseAdmin.from("meta_oauth_states").delete().eq("state", state);

        try {
          const provider = new MetaProvider();

          // 2) code -> short-lived user token -> long-lived user token
          const shortLived = await provider.exchangeCode(code);
          const longLived = await provider.exchangeForLongLivedUserToken(
            shortLived.accessToken,
          );

          // 3) Identify the Meta user and their Pages.
          const me = await provider.getMe(longLived.accessToken);
          const pages = await provider.listPagesWithInstagram(longLived.accessToken);
          if (pages.length === 0) {
            return htmlResult({
              ok: false,
              error:
                "Nenhuma Página do Facebook foi encontrada para esta conta. Verifique se você é admin de ao menos uma Página.",
            });
          }

          // 4) Persist one row per Page (page access tokens are long-lived
          //    by default when derived from a long-lived user token).
          const now = new Date();
          for (const page of pages) {
            const ciphertext = await encryptCredential(page.pageAccessToken);
            const { error: upsertErr } = await supabaseAdmin
              .from("meta_connections")
              .upsert(
                {
                  brand_id: stateRow.brand_id,
                  meta_user_id: me.id,
                  meta_user_name: me.name ?? null,
                  page_id: page.pageId,
                  page_name: page.pageName,
                  page_access_token_ciphertext: ciphertext,
                  ig_business_id: page.instagramBusinessId ?? null,
                  ig_username: page.instagramUsername ?? null,
                  scopes: [],
                  status: "active",
                  last_error: null,
                  token_expires_at: longLived.expiresAt?.toISOString() ?? null,
                  metadata: {
                    category: page.category ?? null,
                    tasks: page.tasks ?? [],
                    linked_at: now.toISOString(),
                  },
                  created_by: stateRow.user_id,
                },
                { onConflict: "brand_id,page_id" },
              );
            if (upsertErr) throw upsertErr;
          }

          return htmlResult({
            ok: true,
            message: `${pages.length} página(s) conectadas`,
            redirectTo: stateRow.redirect_to ?? "/connections",
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
  // Try to close if we were opened as a popup; otherwise redirect after 1.5s.
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
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
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