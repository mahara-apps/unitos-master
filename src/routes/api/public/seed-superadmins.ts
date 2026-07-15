import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/seed-superadmins")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Rota descartável — protegida por header com a senha do super admin
        // (já armazenada como secret). Removida logo após o seed.
        const gate = request.headers.get("x-seed-token");
        if (!gate || gate !== process.env.SUPERADMIN_APITADA_PASSWORD) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const targets = [
          {
            email: "apitadadigital@gmail.com",
            password: process.env.SUPERADMIN_APITADA_PASSWORD,
            full_name: "Apitada Digital",
          },
          {
            email: "jose@mahara.marketing",
            password: process.env.SUPERADMIN_JOSE_PASSWORD,
            full_name: "José Mahara",
          },
        ];

        const results: Array<{ email: string; ok: boolean; id?: string; error?: string }> = [];

        for (const t of targets) {
          if (!t.password) {
            results.push({ email: t.email, ok: false, error: "missing password secret" });
            continue;
          }

          // Try create; if already exists, look up and update password.
          let userId: string | null = null;

          const created = await supabaseAdmin.auth.admin.createUser({
            email: t.email,
            password: t.password,
            email_confirm: true,
            user_metadata: { full_name: t.full_name, role: "super_admin" },
          });

          if (created.error) {
            const msg = created.error.message ?? "";
            if (/already|registered|exists/i.test(msg)) {
              // find existing user
              let page = 1;
              while (!userId) {
                const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
                if (error) {
                  results.push({ email: t.email, ok: false, error: error.message });
                  break;
                }
                const found = data.users.find((u) => (u.email ?? "").toLowerCase() === t.email.toLowerCase());
                if (found) {
                  userId = found.id;
                  break;
                }
                if (data.users.length < 200) break;
                page += 1;
              }
              if (userId) {
                await supabaseAdmin.auth.admin.updateUserById(userId, {
                  password: t.password,
                  email_confirm: true,
                  user_metadata: { full_name: t.full_name, role: "super_admin" },
                });
              }
            } else {
              results.push({ email: t.email, ok: false, error: msg });
              continue;
            }
          } else {
            userId = created.data.user?.id ?? null;
          }

          if (!userId) {
            results.push({ email: t.email, ok: false, error: "no user id" });
            continue;
          }

          // Ensure profile row + flag it as super admin (hidden from listings via RLS).
          const { error: upErr } = await supabaseAdmin
            .from("user_profiles")
            .upsert(
              {
                id: userId,
                full_name: t.full_name,
                is_super_admin: true,
              },
              { onConflict: "id" },
            );

          if (upErr) {
            results.push({ email: t.email, ok: false, id: userId, error: upErr.message });
            continue;
          }

          results.push({ email: t.email, ok: true, id: userId });
        }

        return Response.json({ results });
      },
    },
  },
});