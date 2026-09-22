/**
 * Ensaio PONTA A PONTA de uma instalação nova (ambiente novo), sem rede real.
 *
 * Cada cenário representa um ponto que já quebrou em produção: acesso
 * insuficiente, indisponibilidade momentânea, repositório criado por template,
 * chaves informadas à mão e validação final reprovada. O objetivo é garantir
 * que o fluxo nunca declare sucesso sem ter concluído todas as etapas e que
 * nenhuma operação fique presa "em andamento".
 */
import { describe, expect, it, vi } from "vitest";

import {
  createCodeClient,
  createManagementClient,
  runAutomatedProvision,
  withRepoWriteHint,
} from "@/lib/installation/automation.server";
import { PROVISION_STEPS } from "@/lib/installation/manager-contract";

type Call = { url: string; method: string; body: string };

function fakeClient(detail: Record<string, unknown> = {}) {
  const updates: Record<string, unknown>[] = [];
  const migrationProgress: Record<string, unknown>[] = [];
  const api = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "reconcile_installation_operation_migrations") {
        return { data: 0, error: null };
      }
      if (name === "checkpoint_installation_migration") {
        const row = {
          migration_file: args["_migration_file"],
          fingerprint: args["_fingerprint"],
          package_position: args["_package_position"],
          statement_index: args["_statement_index"],
          total_statements: args["_total_statements"],
          status: args["_completed"] === true ? "completed" : "running",
        };
        const index = migrationProgress.findIndex(
          (current) => current["migration_file"] === row.migration_file,
        );
        if (index >= 0) migrationProgress[index] = row;
        else migrationProgress.push(row);
        return { data: true, error: null };
      }
      if (
        name === "compare_and_set_installation_generated_secrets" ||
        name === "checkpoint_installation_operation" ||
        name === "seal_installation_operation_baseline"
      ) {
        return { data: true, error: null };
      }
      return { data: null, error: null };
    },
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => {
        updates.push(patch);
        const terminal = Promise.resolve({ data: { id: OP.id }, error: null });
        const chain = {} as Record<string, unknown> & PromiseLike<unknown>;
        Object.assign(chain, {
          eq: () => chain,
          is: () => chain,
          in: () => chain,
          select: () => chain,
          maybeSingle: () => terminal,
          then: terminal.then.bind(terminal),
        });
        return chain;
      },
      select: () => ({
        eq: () => ({
          order: async () => ({
            data: table === "installation_operation_migrations" ? migrationProgress : null,
            error: null,
          }),
          maybeSingle: async () => ({ data: { status: "running", steps: [], detail } }),
        }),
      }),
      upsert: async (patch: Record<string, unknown>) => {
        updates.push(patch);
        return { error: null };
      },
    }),
  };
  return { api, updates };
}

const OP = {
  id: "00000000-0000-0000-0000-0000000000e1",
  installation_id: "00000000-0000-0000-0000-0000000000e2",
  kind: "provision",
  status: "running",
  steps: [],
  detail: {},
  summary: null,
  run_token_expires_at: null,
};

const INSTALLATION = {
  id: OP.installation_id,
  domain: null,
  supabaseUrl: "https://novoambientenovo1.supabase.co",
  supabaseProjectRef: "novoambientenovo1",
  deployProject: "unitos-novo",
  gitRepoUrl: "https://github.com/mahara-apps/unitos-novo",
};

const MASTER_ENV = {
  UNITOS_SUPABASE_MANAGEMENT_TOKEN: "sbp_token",
  UNITOS_VERCEL_TOKEN: "vercel_token",
  UNITOS_VERCEL_TEAM_ID: "team_unitos",
  UNITOS_GITHUB_TOKEN: "gh_token",
};

const VERIFY_MARK = "isolamento: banco próprio";

/** Servidor simulado de GitHub + Vercel + Supabase Management. */
function scenario(
  overrides: {
    keysStatus?: number;
    queryStatus?: (body: string) => number | null;
    githubDestStatus?: number;
    verifyRows?: unknown[];
    suppliedKeys?: boolean;
    deploymentStates?: string[];
    deploymentCommit?: string;
    restDeploymentBlockedForGitOnly?: boolean;
    stageProgress?: Record<string, unknown>;
    vercelProjectMissing?: boolean;
    vercelProjectRepo?: string;
    vercelRepoIdMissing?: boolean;
    vercelProjectTeam?: string;
    failEnv?: boolean;
  } = {},
) {
  const calls: Call[] = [];
  let deploymentStateReads = 0;
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const body = init?.body ? String(init.body) : "";
    calls.push({ url: u, method: init?.method ?? "GET", body });

    if (u.includes("api.github.com")) {
      if (u.endsWith("/repos/mahara-apps/unitos-master")) {
        return Response.json({ is_template: true });
      }
      if (u.includes("/contents/supabase/baseline-snapshot/tools/delta_version.txt")) {
        return Response.json({
          encoding: "base64",
          content: Buffer.from("version=9.9.9\n", "utf8").toString("base64"),
        });
      }
      if (overrides.githubDestStatus && u.includes("unitos-novo")) {
        return new Response(
          JSON.stringify({ message: "Resource not accessible by personal access token" }),
          { status: overrides.githubDestStatus },
        );
      }
      if (u.includes("/generate")) return Response.json({ full_name: "mahara-apps/unitos-novo" });
      if (u.includes("/git/trees")) return Response.json({ tree: [] });
      if (u.includes("/git/ref/heads/")) return Response.json({ object: { sha: "sha_dest" } });
      if (u.includes("/commits/main")) return Response.json({ sha: "sha_master" });
      if (u.includes("/git/blobs")) {
        return Response.json({ sha: "blob_1", content: "", encoding: "base64" });
      }
      if (u.includes("/git/commits")) {
        return init?.method === "POST"
          ? Response.json({ sha: "commit_1" })
          : Response.json({ sha: "sha_dest", tree: { sha: "tree_dest" } });
      }
      if (u.includes("/git/refs")) return Response.json({ ok: true });
      return Response.json({ full_name: "mahara-apps/unitos-novo" });
    }

    if (u.includes("/api-keys")) {
      if (overrides.keysStatus && overrides.keysStatus >= 400) {
        return new Response(
          JSON.stringify({ message: "Your account does not have the necessary privileges" }),
          { status: overrides.keysStatus },
        );
      }
      return Response.json([
        { name: "anon", api_key: "sb_publishable_novo" },
        { name: "service_role", api_key: "sb_secret_novo" },
      ]);
    }

    if (u.includes("/database/query")) {
      const forced = overrides.queryStatus?.(body) ?? null;
      if (forced && forced >= 400) {
        return new Response(JSON.stringify({ message: "sem privilégio" }), { status: forced });
      }
      if (body.includes(VERIFY_MARK) && overrides.verifyRows) {
        return Response.json(overrides.verifyRows);
      }
      if (body.includes("select statement_index")) {
        const values = /values \('[^']*',\s*(\d+),\s*(\d+),\s*'running'\)/i.exec(body);
        return Response.json([
          {
            statement_index: Number(values?.[1] ?? 0),
            total_statements: Number(values?.[2] ?? 0),
            status: "running",
          },
        ]);
      }
      if (body.includes("AS vector_ready")) return Response.json([{ vector_ready: true }]);
      return Response.json([{ schemas: 3, item: "ok", status: "PASS" }]);
    }

    if (u.includes("api.vercel.com/v2/user")) {
      return Response.json({ user: { defaultTeamId: "team_unitos" } });
    }
    if (u.includes("api.vercel.com/v2/teams")) {
      return Response.json({ teams: [{ id: "team_unitos" }, { id: "team_other" }] });
    }
    if (u.includes("api.vercel.com/v9/projects/unitos-novo") && u.includes("teamId=team_other")) {
      return new Response("not found", { status: 404 });
    }
    if (u.includes("api.vercel.com/v11/projects")) {
      return Response.json({
        id: "prj_new",
        name: "unitos-novo",
        accountId: "team_unitos",
        link: {
          type: "github",
          org: "mahara-apps",
          repo: "unitos-novo",
          productionBranch: "main",
        },
      });
    }
    if (u.includes("api.vercel.com/v9/projects")) {
      if (overrides.vercelProjectMissing && !u.includes("prj_new")) {
        return new Response("not found", { status: 404 });
      }
      return Response.json({
        id: "prj_new",
        name: "unitos-novo",
        accountId: overrides.vercelProjectTeam ?? "team_unitos",
        link: {
          type: "github",
          org: "mahara-apps",
          repo: overrides.vercelProjectRepo ?? "unitos-novo",
          ...(overrides.vercelRepoIdMissing ? {} : { repoId: 101 }),
          productionBranch: "main",
        },
        targets: { production: { url: "unitos-novo-abc.vercel.app" } },
      });
    }
    if (u.includes("/env")) {
      return overrides.failEnv
        ? new Response('{"error":"env failed"}', { status: 500 })
        : Response.json({ created: [] });
    }
    if (u.includes("api.vercel.com/v6/deployments")) {
      return overrides.restDeploymentBlockedForGitOnly
        ? Response.json({
            deployments: [
              {
                uid: "dpl_git",
                name: "unitos-novo",
                readyState: "READY",
                source: "git",
                createdAt: 2,
                meta: { githubCommitSha: "commit_1" },
              },
              {
                uid: "dpl_new",
                name: "unitos-novo",
                readyState: "BLOCKED",
                source: "api",
                createdAt: 1,
                meta: { githubCommitSha: "sha_master" },
              },
            ],
          })
        : Response.json({ deployments: [{ uid: "dpl_prev", name: "unitos-novo" }] });
    }
    if (u.includes("api.vercel.com/v13/deployments/dpl_git")) {
      return Response.json({
        readyState: "READY",
        url: "unitos-novo-abc.vercel.app",
        meta: { githubCommitSha: "commit_1" },
      });
    }
    if (u.includes("api.vercel.com/v13/deployments/dpl_new")) {
      if (overrides.restDeploymentBlockedForGitOnly) {
        return Response.json({
          readyState: "BLOCKED",
          readyStateReason:
            "REST API deployments are not allowed in production. Only Git deployments are allowed.",
          alwaysRefuseToBuild: true,
          meta: { githubCommitSha: "sha_master" },
        });
      }
      const states = overrides.deploymentStates ?? ["READY"];
      const readyState = states[Math.min(deploymentStateReads, states.length - 1)];
      deploymentStateReads += 1;
      return Response.json({
        readyState,
        url: "unitos-novo-abc.vercel.app",
        meta: { githubCommitSha: overrides.deploymentCommit ?? "sha_master" },
      });
    }
    if (u.includes("api.vercel.com/v13/deployments")) return Response.json({ id: "dpl_new" });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  const env = overrides.suppliedKeys
    ? {
        ...MASTER_ENV,
        UNITOS_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_manual",
        UNITOS_SUPABASE_SERVICE_ROLE_KEY: "sb_secret_manual",
      }
    : MASTER_ENV;

  const { api, updates } = fakeClient(
    overrides.stageProgress ? { stageProgress: overrides.stageProgress } : undefined,
  );
  const run = () =>
    runAutomatedProvision({
      client: api,
      operation: OP,
      installation: INSTALLATION,
      env,
      fetchImpl: fetchImpl as never,
      sleep: async () => {},
      maxStatementsPerInvocation: Number.POSITIVE_INFINITY,
      maxMigrationsPerInvocation: Number.POSITIVE_INFINITY,
      waitMs: 6_000,
    });

  return { run, calls, updates };
}

const dbWrites = (calls: Call[]) =>
  calls.filter(
    (c) =>
      c.url.includes("/database/query") &&
      /create table|alter table|insert into/i.test(c.body) &&
      !c.body.includes(VERIFY_MARK),
  );

describe("instalação de ambiente novo — ponta a ponta", () => {
  it("caminho completo: todas as etapas concluídas, URL publicada e validação final aprovada", async () => {
    const { run, calls } = scenario();
    const result = await run();

    expect(result.result).toBe("PASS");
    expect(result.appUrl).toBe("https://unitos-novo-abc.vercel.app");
    expect(result.steps.every((s) => s.state === "done")).toBe(true);

    // Nenhuma etapa do contrato pode faltar no relatório final.
    const reported = new Set(result.steps.map((s) => s.id));
    for (const step of PROVISION_STEPS) expect(reported.has(step.id)).toBe(true);

    // A validação final rodou de verdade contra o banco do destino.
    expect(calls.some((c) => c.body.includes(VERIFY_MARK))).toBe(true);
  });

  it("projeto inexistente é criado automaticamente no team e ligado ao GitHub", async () => {
    const { run, calls } = scenario({ vercelProjectMissing: true });
    const result = await run();
    expect(result.result).toBe("PASS");
    const creates = calls.filter(
      (call) => call.method === "POST" && call.url.includes("api.vercel.com/v11/projects"),
    );
    expect(creates).toHaveLength(1);
    expect(JSON.parse(creates[0]?.body ?? "{}")).toMatchObject({
      name: "unitos-novo",
      gitRepository: { type: "github", repo: "mahara-apps/unitos-novo" },
    });
    expect(creates[0]?.url).toContain("teamId=team_unitos");
    expect(calls.some((call) => call.url.includes("/v9/projects/prj_new"))).toBe(true);
  });

  it("projeto recém-criado sem repoId aguarda o deployment Git sem tentar REST inválido", async () => {
    const { run, calls } = scenario({
      vercelProjectMissing: true,
      vercelRepoIdMissing: true,
    });
    const result = await run();

    expect(result.result).toBe("RUNNING");
    expect(
      calls.some(
        (call) =>
          call.method === "POST" &&
          call.url.includes("api.vercel.com/v13/deployments") &&
          call.body.includes('"gitSource"'),
      ),
    ).toBe(false);
    expect(calls.some((call) => call.url.includes("api.vercel.com/v6/deployments"))).toBe(true);
  });

  it("falha após criar o projeto retoma pelo checkpoint sem criar duplicado", async () => {
    const first = scenario({ vercelProjectMissing: true, failEnv: true });
    expect((await first.run()).result).not.toBe("PASS");
    expect(first.calls.filter((call) => call.url.includes("/v11/projects"))).toHaveLength(1);

    const resumed = scenario({
      stageProgress: {
        provisionVercelProjectReady: true,
        provisionVercelProjectId: "prj_new",
        provisionVercelTeamId: "team_unitos",
        codeDone: true,
        codeSha: "sha_master",
        codeSourceSha: "sha_master",
        provisionRelease: "9.9.9",
      },
    });
    expect((await resumed.run()).result).toBe("PASS");
    expect(resumed.calls.some((call) => call.url.includes("/v11/projects"))).toBe(false);
    expect(resumed.calls.some((call) => call.url.includes("/v9/projects/prj_new"))).toBe(true);
  });

  it("projeto existente ligado a outro repositório bloqueia sem religar", async () => {
    const { run, calls } = scenario({ vercelProjectRepo: "mahara-apps/outro" });
    const result = await run();
    expect(result.result).toBe("BLOCKED");
    expect(result.reasons.join(" ")).toContain("não ao repositório esperado");
    expect(calls.some((call) => call.method === "DELETE" && call.url.includes("/link"))).toBe(
      false,
    );
  });

  it("ownership em outro team bloqueia o projeto existente", async () => {
    const { run } = scenario({ vercelProjectTeam: "team_other" });
    const result = await run();
    expect(result.result).toBe("BLOCKED");
    expect(result.reasons.join(" ")).toContain("ownership");
  });

  it("HTTP 200 não passa enquanto o deployment específico permanece BUILDING", async () => {
    const { run, calls } = scenario({ deploymentStates: ["BUILDING"] });
    const result = await run();

    expect(result.result).toBe("RUNNING");
    expect(calls.some((call) => call.url === "https://unitos-novo-abc.vercel.app")).toBe(false);
  });

  it("READY com SHA divergente falha antes do probe HTTP", async () => {
    const { run, calls } = scenario({ deploymentCommit: "sha_incorreto" });
    const result = await run();

    expect(result.result).toBe("FAIL");
    expect(result.reasons.join(" ")).toContain("commit autorizado");
    expect(calls.some((call) => call.url === "https://unitos-novo-abc.vercel.app")).toBe(false);
  });

  it("ERROR no deployment específico falha antes do probe HTTP", async () => {
    const { run, calls } = scenario({ deploymentStates: ["ERROR"] });
    const result = await run();

    expect(result.result).toBe("FAIL");
    expect(result.reasons.join(" ")).toContain("ERROR");
    expect(calls.some((call) => call.url === "https://unitos-novo-abc.vercel.app")).toBe(false);
  });

  it("troca deployment REST posteriormente bloqueado pelo deployment do commit Git", async () => {
    const { run, calls, updates } = scenario({ restDeploymentBlockedForGitOnly: true });
    const result = await run();

    expect(result.result).toBe("PASS");
    expect(calls.some((call) => call.url.includes("/v13/deployments/dpl_new"))).toBe(true);
    expect(calls.some((call) => call.url.includes("/v13/deployments/dpl_git"))).toBe(true);
    expect(
      calls.filter(
        (call) => call.method === "POST" && call.url.includes("/git/commits"),
      ),
    ).toHaveLength(1);
    expect(
      updates.some((update) =>
        JSON.stringify(update).includes('"provisionDeploymentId":"dpl_git"'),
      ),
    ).toBe(true);
  });

  it("retoma pelo deployment ID persistido sem criar outro", async () => {
    const { run, calls } = scenario({
      stageProgress: {
        provisionDeploymentId: "dpl_new",
        provisionDeploymentCommit: "sha_master",
        provisionDeploymentState: "BUILDING",
        codeDone: true,
        codeSha: "sha_master",
        codeSourceSha: "sha_master",
        provisionRelease: "9.9.9",
      },
    });
    const result = await run();

    expect(result.result).toBe("PASS");
    const deploymentCreates = calls.filter(
      (call) =>
        call.url.includes("api.vercel.com/v13/deployments") &&
        call.method === "POST" &&
        call.body.includes('"gitSource"'),
    );
    expect(deploymentCreates).toHaveLength(0);
    expect(calls.some((call) => call.url.includes("/v13/deployments/dpl_new"))).toBe(true);
  });

  it("validação final reprovada nunca vira sucesso", async () => {
    const { run } = scenario({
      verifyRows: [
        { check_name: "RLS habilitado", observed: "3 tabelas", status: "FAIL" },
        { check_name: "seeds de catálogo", observed: "ok", status: "PASS" },
      ],
    });
    const result = await run();

    expect(result.result).not.toBe("PASS");
    expect(result.reasons.join(" ")).toMatch(/verify-installation|RLS/i);
  });

  it("acesso insuficiente no Supabase interrompe antes de tocar no banco", async () => {
    const { run, calls } = scenario({
      queryStatus: (body) => (body.includes("schemas") ? 403 : null),
    });
    const result = await run();

    expect(result.result).toBe("BLOCKED");
    expect(result.reasons.join(" ")).toContain("Supabase destino");
    expect(dbWrites(calls)).toHaveLength(0);
  });

  it("chaves não reveláveis pelo token são supridas pelas chaves informadas à mão", async () => {
    const blocked = await scenario({ keysStatus: 403 }).run();
    expect(blocked.result).toBe("BLOCKED");
    expect(blocked.reasons.join(" ")).toContain("chaves");

    const supplied = await scenario({ keysStatus: 403, suppliedKeys: true }).run();
    expect(supplied.result).toBe("PASS");
  });

  it("token sem gravação no repositório da instalação dá motivo acionável e não publica", async () => {
    const { run, calls } = scenario({ githubDestStatus: 403 });
    const result = await run();

    expect(result.result).not.toBe("PASS");
    expect(result.reasons.join(" ").length).toBeGreaterThan(10);
    // Falhou no código: nada de publicar deployment novo depois disso.
    expect(calls.some((c) => c.url.includes("v13/deployments"))).toBe(false);
  });

  it("indisponibilidade momentânea do Supabase é tratada como temporária, com nova tentativa", async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) return new Response("error code: 502", { status: 502 });
      return Response.json([{ schemas: 3 }]);
    }) as unknown as typeof fetch;

    const management = createManagementClient({
      token: "sbp_token",
      projectRef: "novoambientenovo1",
      fetchImpl: fetchImpl as never,
    });
    const ping = await management.query("select 1 as schemas");

    expect(ping.ok).toBe(true);
    expect(attempts).toBeGreaterThan(1);
  });

  it("qualquer desfecho fecha a operação — nada permanece em andamento", async () => {
    for (const s of [scenario(), scenario({ githubDestStatus: 403 })]) {
      const { run, updates } = s;
      await run();
      const finals = updates.filter(
        (u) => typeof u["status"] === "string" && u["status"] !== "running",
      );
      expect(finals.length).toBeGreaterThan(0);
      expect(finals.some((u) => u["finished_at"])).toBe(true);
    }
  });
});

describe("permissão de gravação no repositório", () => {
  it("traduz o 403 do GitHub na permissão exata que falta", () => {
    const hint = withRepoWriteHint(
      'HTTP 403 ao publicar arquivo ({"message":"Resource not accessible by personal access token"})',
      "mahara-apps/unitos-casa8",
    );
    expect(hint).toContain("Contents: Read and write");
    expect(hint).toContain("mahara-apps/unitos-casa8");
  });

  it("não altera mensagens que não são de permissão", () => {
    expect(withRepoWriteHint("HTTP 502 instabilidade", "a/b")).toBe("HTTP 502 instabilidade");
  });

  it("o teste de acesso comprova a gravação escrevendo de verdade", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u}`);
      if (u.includes("/rate_limit")) {
        return Response.json({ resources: { core: { remaining: 4999, limit: 5000 } } });
      }
      if (u.endsWith("/user")) return Response.json({ login: "mahara-apps" });
      if (u.includes("/git/blobs")) {
        return new Response(
          JSON.stringify({ message: "Resource not accessible by personal access token" }),
          { status: 403 },
        );
      }
      // metadados do repositório mentem: dizem que há push
      return Response.json({ permissions: { push: true }, is_template: true });
    }) as unknown as typeof fetch;

    const code = createCodeClient({
      token: "gh_token",
      masterToken: "gh_master",
      owner: "mahara-apps",
      repo: "unitos-casa8",
      masterRepo: "mahara-apps/unitos-master",
      fetchImpl: fetchImpl as never,
    });
    const checks = await code.permissions();
    const write = checks.find((c) => /Gravação no repositório/i.test(c.label));

    expect(calls.some((c) => c.startsWith("POST") && c.includes("/git/blobs"))).toBe(true);
    expect(write?.ok).toBe(false);
    expect(write?.detail).toContain("Contents: Read and write");
  });
});
