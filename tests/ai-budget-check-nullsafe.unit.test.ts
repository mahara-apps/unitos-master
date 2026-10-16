import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const delta = readFileSync("supabase/baseline-snapshot/007_delta_migrations.sql", "utf8");
const last = delta.slice(delta.lastIndexOf("CREATE OR REPLACE FUNCTION public.check_ai_usage_budget"));
const body = last.slice(0, last.indexOf("$function$;"));

describe("check_ai_usage_budget no pacote", () => {
  it("não lê limite de record não atribuído (falha com usuário/cliente nulos)", () => {
    expect(body).not.toMatch(/_lim\.limit_usd/);
    expect(body).toMatch(/brand_limit numeric/);
  });
  it("não concede execução a anon", () => {
    expect(delta).toMatch(/REVOKE ALL ON FUNCTION public\.check_ai_usage_budget\(uuid, uuid, uuid\) FROM PUBLIC, anon/);
  });
});
