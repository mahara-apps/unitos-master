import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function admin() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function cors(res: Response) {
  res.headers.set("access-control-allow-origin", "*");
  res.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  res.headers.set("access-control-allow-headers", "content-type");
  return res;
}

export const Route = createFileRoute("/api/public/approval/$token")({
  server: {
    handlers: {
      OPTIONS: () => cors(new Response(null, { status: 204 })),

      GET: async ({ params }) => {
        const db = admin();
        const { data: tok } = await db
          .from("card_approval_tokens")
          .select("id, post_id, brand_id, expires_at, revoked_at")
          .eq("token", params.token)
          .maybeSingle();
        if (!tok) return cors(new Response("invalid token", { status: 404 }));
        if (tok.revoked_at) return cors(new Response("token revoked", { status: 410 }));
        if (tok.expires_at && new Date(tok.expires_at).getTime() < Date.now())
          return cors(new Response("token expired", { status: 410 }));

        const { data: post } = await db
          .from("posts")
          .select(
            "id, title, copy, format, channels, scheduled_at, cover_url, client_briefing, script, references, reference_media, review_status",
          )
          .eq("id", tok.post_id)
          .is("deleted_at", null)
          .single();
        if (!post) return cors(new Response("post not found", { status: 404 }));

        const { data: client } = await db
          .from("clients")
          .select("name, brand_hub")
          .eq("id", (await db.from("posts").select("client_id").eq("id", post.id).single()).data?.client_id ?? "")
          .maybeSingle();

        return cors(
          Response.json({
            post,
            client: client ? { name: client.name } : null,
            token: { id: tok.id, expires_at: tok.expires_at },
          }),
        );
      },

      POST: async ({ request, params }) => {
        const body = (await request.json().catch(() => ({}))) as {
          verb?: string;
          comment?: string;
        };
        const verb = body.verb;
        if (verb !== "approved" && verb !== "changes_requested")
          return cors(new Response("invalid verb", { status: 400 }));

        const db = admin();
        const { data: tok } = await db
          .from("card_approval_tokens")
          .select("id, post_id, brand_id, expires_at, revoked_at")
          .eq("token", params.token)
          .maybeSingle();
        if (!tok) return cors(new Response("invalid token", { status: 404 }));
        if (tok.revoked_at || (tok.expires_at && new Date(tok.expires_at).getTime() < Date.now()))
          return cors(new Response("token unavailable", { status: 410 }));

        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
        const ua = request.headers.get("user-agent") ?? null;

        await db.from("card_approval_events").insert({
          post_id: tok.post_id,
          token_id: tok.id,
          brand_id: tok.brand_id,
          verb,
          comment: body.comment?.slice(0, 2000) ?? null,
          ip,
          user_agent: ua,
        });

        if (verb === "approved") {
          await db
            .from("posts")
            .update({
              review_status: "approved",
              approved_at: new Date().toISOString(),
            })
            .eq("id", tok.post_id);
        } else {
          await db
            .from("posts")
            .update({
              review_status: "rework",
              rework_notes: body.comment?.slice(0, 2000) ?? null,
            })
            .eq("id", tok.post_id);
        }

        return cors(Response.json({ ok: true }));
      },
    },
  },
});