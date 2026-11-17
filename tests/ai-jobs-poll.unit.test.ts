import { describe, expect, it } from "vitest";
import {
  AI_JOBS_ACTIVE_POLL_MS,
  aiJobsPollInterval,
  queryKeysToRefreshOnJobEnd,
} from "@/lib/ai-jobs-poll";
import { readFileSync, readdirSync } from "node:fs";

describe("acompanhamento das gerações de IA", () => {
  it("relê a lista enquanto uma geração está em andamento", () => {
    expect(aiJobsPollInterval([{ status: "running" }])).toBe(AI_JOBS_ACTIVE_POLL_MS);
    expect(aiJobsPollInterval([{ status: "queued" }, { status: "succeeded" }])).toBe(4_000);
  });

  it("para de reler quando nada está em andamento", () => {
    expect(aiJobsPollInterval([{ status: "succeeded" }, { status: "failed" }])).toBe(false);
    expect(aiJobsPollInterval(undefined)).toBe(false);
  });

  it("ao terminar a pauta mensal, recarrega a lista de pautas", () => {
    const keys = queryKeysToRefreshOnJobEnd({ status: "succeeded", kind: "monthly_plan" });
    expect(keys).toContainEqual(["plan-board"]);
    expect(keys).toContainEqual(["monthly-plans"]);
  });

  it("pacote de instalação publica ai_jobs no tempo real", () => {
    const delta = readFileSync("supabase/baseline-snapshot/007_delta_migrations.sql", "utf8");
    expect(delta).toMatch(/'ai_jobs', 'notifications', 'tasks'/);
    expect(delta).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.%I");
    expect(readdirSync("supabase/migrations").length).toBeGreaterThan(0);
  });
});
