import { createFileRoute } from "@tanstack/react-router";

/**
 * SLA overdue notifier.
 * Called by pg_cron once per hour. Authenticated via apikey header (anon key)
 * which is already stored in the project — no custom secret needed.
 *
 * For each non-terminal stage with sla_days > 0, finds posts whose
 * (now - stage_entered_at) > sla_days and:
 *  - notifies the assignee (kind: sla_overdue)
 *  - notifies workspace owners/managers with an aggregated summary (kind: sla_overdue_manager)
 *
 * Dedupe: skip if a notification for the same (user_id, post_id, kind) already exists in the last 24h.
 */
export const Route = createFileRoute("/api/public/cron/sla-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        if (!apikey || !expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1. Load stages with SLA
        const { data: stages, error: sErr } = await supabaseAdmin
          .from("content_pipeline_stages")
          .select("id,label,sla_days,sla_hours,is_terminal,pipeline_id")
          .eq("is_terminal", false);
        if (sErr) throw sErr;
        const stagesWithSla = (stages ?? [])
          .map((s) => {
            const h = (s.sla_hours as number | null) ?? null;
            const d = (s.sla_days as number | null) ?? null;
            const hours = h != null && h > 0 ? h : d != null && d > 0 ? d * 24 : null;
            return hours != null ? { ...s, _hours: hours } : null;
          })
          .filter(Boolean) as Array<{ id: string; label: string; _hours: number }>;
        if (stagesWithSla.length === 0) {
          return Response.json({ ok: true, scanned: 0, notified: 0 });
        }

        // 2. For each stage, find overdue posts
        const cutoffByStage = new Map<string, { label: string; sinceIso: string }>();
        for (const s of stagesWithSla) {
          const since = new Date(Date.now() - s._hours * 3_600_000).toISOString();
          cutoffByStage.set(s.id, { label: s.label, sinceIso: since });
        }

        const overdue: Array<{
          post_id: string;
          title: string;
          assignee_id: string | null;
          brand_id: string;
          client_id: string;
          stage_id: string;
          stage_label: string;
          hours_overdue: number;
          sla_hours: number;
        }> = [];

        for (const s of stagesWithSla) {
          const cutoff = cutoffByStage.get(s.id)!;
          const { data: rows, error: pErr } = await supabaseAdmin
            .from("posts")
            .select("id,title,assignee_id,brand_id,client_id,stage_id,stage_entered_at")
            .eq("stage_id", s.id)
            .is("deleted_at", null)
            .lt("stage_entered_at", cutoff.sinceIso);
          if (pErr) throw pErr;
          for (const r of rows ?? []) {
            const hoursIn = (Date.now() - new Date(r.stage_entered_at as string).getTime()) / 3_600_000;
            overdue.push({
              post_id: r.id as string,
              title: (r.title as string) ?? "Sem título",
              assignee_id: (r.assignee_id as string | null) ?? null,
              brand_id: r.brand_id as string,
              client_id: r.client_id as string,
              stage_id: r.stage_id as string,
              stage_label: cutoff.label,
              hours_overdue: Math.max(0, hoursIn - s._hours),
              sla_hours: s._hours,
            });
          }
        }

        if (overdue.length === 0) {
          return Response.json({ ok: true, scanned: 0, notified: 0 });
        }

        // 3. Notify assignees (dedupe last 24h per (user, post, kind))
        const since24h = new Date(Date.now() - 86_400_000).toISOString();
        const withAssignee = overdue.filter((o) => o.assignee_id);

        let notifiedAssignees = 0;
        if (withAssignee.length > 0) {
          const userIds = Array.from(new Set(withAssignee.map((o) => o.assignee_id as string)));
          const { data: recent } = await supabaseAdmin
            .from("notifications")
            .select("user_id, payload")
            .eq("kind", "sla_overdue")
            .in("user_id", userIds)
            .gte("created_at", since24h);
          const seen = new Set(
            (recent ?? [])
              .map((r) => {
                const p = (r.payload as Record<string, unknown> | null) ?? {};
                const postId = typeof p.post_id === "string" ? (p.post_id as string) : null;
                return postId ? `${r.user_id}:${postId}` : null;
              })
              .filter(Boolean) as string[],
          );
          const toInsert = withAssignee
            .filter((o) => !seen.has(`${o.assignee_id}:${o.post_id}`))
            .map((o) => {
              const overdueLabel =
                o.hours_overdue >= 24
                  ? `${Math.floor(o.hours_overdue / 24)}d`
                  : `${Math.round(o.hours_overdue)}h`;
              const slaLabel = o.sla_hours >= 24 ? `${Math.round(o.sla_hours / 24)}d` : `${o.sla_hours}h`;
              return {
              user_id: o.assignee_id as string,
              brand_id: o.brand_id,
              kind: "sla_overdue" as const,
              title: `SLA vencido em "${o.stage_label}"`,
              body: `${o.title} • atrasado há ${overdueLabel} (SLA ${slaLabel})`,
              href: `/content`,
              payload: {
                post_id: o.post_id,
                stage_id: o.stage_id,
                stage_label: o.stage_label,
                hours_overdue: o.hours_overdue,
                sla_hours: o.sla_hours,
              },
              };
            });
          if (toInsert.length > 0) {
            const { error: insErr } = await supabaseAdmin.from("notifications").insert(toInsert as never);
            if (insErr) throw insErr;
            notifiedAssignees = toInsert.length;
          }
        }

        // 4. Notify managers per brand (aggregated: one per manager per brand per day)
        const brandIds = Array.from(new Set(overdue.map((o) => o.brand_id)));
        const { data: managers } = await supabaseAdmin
          .from("brand_members")
          .select("user_id, brand_id, role")
          .in("brand_id", brandIds)
          .in("role", ["owner", "manager"]);

        // dedupe managers per brand for today
        const { data: mgrRecent } = await supabaseAdmin
          .from("notifications")
          .select("user_id, brand_id")
          .eq("kind", "sla_overdue_manager")
          .gte("created_at", since24h);
        const mgrSeen = new Set(
          (mgrRecent ?? []).map((r) => `${r.user_id}:${r.brand_id}`),
        );

        const overdueByBrand = new Map<string, typeof overdue>();
        for (const o of overdue) {
          if (!overdueByBrand.has(o.brand_id)) overdueByBrand.set(o.brand_id, []);
          overdueByBrand.get(o.brand_id)!.push(o);
        }

        const mgrInserts: Array<{
          user_id: string;
          brand_id: string;
          kind: "sla_overdue_manager";
          title: string;
          body: string;
          href: string;
          payload: Record<string, unknown>;
        }> = [];
        for (const m of managers ?? []) {
          const key = `${m.user_id}:${m.brand_id}`;
          if (mgrSeen.has(key)) continue;
          const list = overdueByBrand.get(m.brand_id as string) ?? [];
          if (list.length === 0) continue;
          mgrInserts.push({
            user_id: m.user_id as string,
            brand_id: m.brand_id as string,
            kind: "sla_overdue_manager",
            title: `${list.length} tarefa(s) atrasada(s) no workspace`,
            body: `${list.slice(0, 3).map((l) => l.title).join(", ")}${list.length > 3 ? "…" : ""}`,
            href: `/content`,
            payload: {
              count: list.length,
              post_ids: list.map((l) => l.post_id).slice(0, 20),
            },
          });
        }

        let notifiedManagers = 0;
        if (mgrInserts.length > 0) {
          const { error: mErr } = await supabaseAdmin.from("notifications").insert(mgrInserts as never);
          if (mErr) throw mErr;
          notifiedManagers = mgrInserts.length;
        }

        return Response.json({
          ok: true,
          scanned: overdue.length,
          notified_assignees: notifiedAssignees,
          notified_managers: notifiedManagers,
        });
      },
    },
  },
});