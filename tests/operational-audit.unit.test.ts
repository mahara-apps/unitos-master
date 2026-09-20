import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  sanitizeOperationalMetadata,
  sanitizeOperationalText,
} from "../src/lib/operational-audit.server";

describe("auditoria operacional", () => {
  const migration = readFileSync(
    "supabase/migrations/20260920133109_1aec88a7-bd4d-45fe-a8b6-5b7be92ac9b4.sql",
    "utf8",
  );
  const hardening = readFileSync(
    "supabase/migrations/20260920135809_c8f58682-011e-4b63-8c84-b83ace82b0b1.sql",
    "utf8",
  );
  const verify = readFileSync("supabase/install/verify-installation-client.sql", "utf8");

  it("remove chaves e bearer tokens das mensagens", () => {
    expect(sanitizeOperationalText("Bearer abcdefghijkl re_123456789")).toBe(
      "[redacted] [redacted]",
    );
  });

  it("remove segredos aninhados e limita coleções", () => {
    const out = sanitizeOperationalMetadata({
      apiKey: "secret-value",
      nested: { authorization: "Bearer unsafe-token", safe: "ok" },
      items: Array.from({ length: 30 }, (_, index) => index),
    });
    expect(out.apiKey).toBe("[redacted]");
    expect(out.nested).toEqual({ authorization: "[redacted]", safe: "ok" });
    expect(out.items).toHaveLength(20);
  });

  it("limita campos textuais", () => {
    expect(sanitizeOperationalText("x".repeat(700))).toHaveLength(500);
  });

  it("mantém a trilha protegida, escopada e com retenção", () => {
    expect(migration).toContain("ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("system_events_owner_admin_read");
    expect(migration).toContain("app_access_role(auth.uid(), brand_id) = 'admin'");
    expect(migration).toContain("system_events_guard_scope_trg");
    expect(migration).toContain("purge_system_events_90d");
    expect(migration).toContain("REVOKE ALL ON public.system_events FROM anon");
    expect(hardening).toContain(
      "REVOKE ALL ON FUNCTION public.system_events_guard_scope() FROM PUBLIC, anon, authenticated",
    );
    expect(verify).toContain("'project_job_counters','system_events'");
    expect(verify).toContain(
      "auditoria operacional: tabela, RLS, política, retenção e escopo protegidos",
    );
  });
});
