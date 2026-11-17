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

import { copyQueuePollInterval } from "@/lib/ai-jobs-poll";
import { writeJobTerminal } from "@/lib/ai-job-terminal";

describe("outras gerações em segundo plano", () => {
  it("ao terminar a estratégia, recarrega a estratégia do cliente", () => {
    const keys = queryKeysToRefreshOnJobEnd({ status: "succeeded", kind: "customer_strategy" });
    expect(keys).toContainEqual(["strategy-gate"]);
    expect(keys).toContainEqual(["brand-hub"]);
  });

  it("fila de legendas relê o quadro só enquanto há legenda em produção", () => {
    expect(copyQueuePollInterval(2)).toBe(8_000);
    expect(copyQueuePollInterval(0)).toBe(false);
  });

  it("fim da geração é regravado quando a primeira escrita falha", async () => {
    let calls = 0;
    const ok = await writeJobTerminal(async () => {
      calls += 1;
      return { error: calls === 1 ? new Error("rede") : null };
    }, "teste");
    expect(ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("telas que iniciam gerações pedem a lista certa de gerações", () => {
    for (const f of [
      "src/components/brand-hub/briefing-workspace.tsx",
      "src/components/brand-hub/quick-onboarding-wizard.tsx",
    ]) {
      expect(readFileSync(f, "utf8")).not.toContain('["ai-jobs", "active"]');
    }
  });
});
