import { describe, it, expect } from "vitest";
import { revokeMetaPortfolio } from "@/lib/meta/authorization.server";

/**
 * Desconexão do portfólio Meta × "Contas disponíveis".
 *
 * A causa raiz do bug era a autorização (`meta_oauth_sessions`) sobreviver à
 * desconexão: o cache `pages` daquela autorização continuava alimentando
 * "Contas disponíveis" (87 contas com 0 canais conectados). Aqui garantimos que
 * a autorização é SEMPRE revogada, escopada por workspace, e que a listagem só
 * considera autorizações com `revoked_at is null`.
 */

type Op = {
  table: string;
  kind: "select" | "update" | "delete";
  filters: Array<[string, unknown]>;
  payload?: Record<string, unknown>;
};

function fakeSupabase(opts: {
  connections: Array<{ id: string; owner_external_id: string | null }>;
  remainingActive: number;
}) {
  const ops: Op[] = [];

  function builder(table: string, kind: Op["kind"], payload?: Record<string, unknown>) {
    const op: Op = { table, kind, filters: [], payload };
    ops.push(op);
    const api: any = {
      eq: (c: string, v: unknown) => (op.filters.push([`eq:${c}`, v]), api),
      neq: (c: string, v: unknown) => (op.filters.push([`neq:${c}`, v]), api),
      is: (c: string, v: unknown) => (op.filters.push([`is:${c}`, v]), api),
      in: (c: string, v: unknown) => (op.filters.push([`in:${c}`, v]), api),
      then: (resolve: (r: unknown) => unknown) => {
        if (table === "social_connections" && kind === "select") {
          const head = op.filters.some(([k]) => k === "eq:provider") && op.payload?.head;
          if (head) return resolve({ count: opts.remainingActive, error: null });
          const wantsOwner = op.filters.find(([k]) => k === "eq:owner_external_id")?.[1] ?? null;
          const rows = opts.connections.filter((c) =>
            wantsOwner ? c.owner_external_id === wantsOwner : c.owner_external_id === null,
          );
          return resolve({ data: rows.map((r) => ({ id: r.id })), error: null });
        }
        return resolve({ data: null, error: null });
      },
    };
    return api;
  }

  return {
    ops,
    client: {
      from: (table: string) => ({
        select: (_cols: string, o?: { count?: string; head?: boolean }) =>
          builder(table, "select", o as Record<string, unknown>),
        update: (payload: Record<string, unknown>) => builder(table, "update", payload),
        delete: () => builder(table, "delete"),
      }),
    },
  };
}

const BRAND_A = "11111111-1111-1111-1111-111111111111";

describe("desconexão do portfólio Meta revoga a autorização", () => {
  it("Cenário A: revoga canais, vínculos e autorização; lista fica vazia", async () => {
    const fake = fakeSupabase({
      connections: [{ id: "c1", owner_external_id: null }],
      remainingActive: 0,
    });
    const res = await revokeMetaPortfolio(fake.client, {
      brandId: BRAND_A,
      ownerExternalId: null,
    });
    expect(res.removed).toBe(1);

    // vínculo com cliente removido, conexão marcada como revoked (histórico)
    expect(fake.ops.some((o) => o.table === "client_social_accounts" && o.kind === "delete")).toBe(
      true,
    );
    expect(
      fake.ops.some((o) => o.table === "social_connections" && o.payload?.status === "revoked"),
    ).toBe(true);

    // autorização revogada — é isso que zera "Contas disponíveis"
    const sessionUpdates = fake.ops.filter(
      (o) => o.table === "meta_oauth_sessions" && o.kind === "update",
    );
    expect(sessionUpdates.length).toBeGreaterThan(0);
    for (const op of sessionUpdates) {
      expect(op.payload?.revoked_at).toBeTruthy();
      expect(op.filters).toContainEqual(["eq:brand_id", BRAND_A]);
      expect(op.filters).toContainEqual(["is:revoked_at", null]);
    }
  });

  it("revoga a autorização mesmo sem nenhum canal vinculado (0 canais, contas ainda listadas)", async () => {
    const fake = fakeSupabase({ connections: [], remainingActive: 0 });
    const res = await revokeMetaPortfolio(fake.client, {
      brandId: BRAND_A,
      ownerExternalId: null,
    });
    expect(res.removed).toBe(0);
    expect(
      fake.ops.filter((o) => o.table === "meta_oauth_sessions" && o.payload?.revoked_at).length,
    ).toBeGreaterThan(0);
  });

  it("Cenário C: toda escrita é escopada pelo brand_id do workspace", async () => {
    const fake = fakeSupabase({
      connections: [{ id: "c1", owner_external_id: "portfolio-1" }],
      remainingActive: 0,
    });
    await revokeMetaPortfolio(fake.client, {
      brandId: BRAND_A,
      ownerExternalId: "portfolio-1",
    });
    for (const op of fake.ops) {
      expect(op.filters).toContainEqual(["eq:brand_id", BRAND_A]);
    }
  });

  it("Cenário B: com outro portfólio ainda ativo, só a autorização daquele portfólio é revogada", async () => {
    const fake = fakeSupabase({
      connections: [{ id: "c1", owner_external_id: "portfolio-1" }],
      remainingActive: 2,
    });
    await revokeMetaPortfolio(fake.client, {
      brandId: BRAND_A,
      ownerExternalId: "portfolio-1",
    });
    const sessionUpdates = fake.ops.filter((o) => o.table === "meta_oauth_sessions");
    expect(sessionUpdates).toHaveLength(1);
    expect(sessionUpdates[0]!.filters).toContainEqual(["eq:meta_user_id", "portfolio-1"]);
  });
});

describe("listagem de contas ignora autorizações revogadas", () => {
  it("as queries de descoberta filtram revoked_at is null", async () => {
    const fs = await import("node:fs/promises");
    const discovery = await fs.readFile("src/lib/meta/discovery.functions.ts", "utf8");
    const admin = await fs.readFile("src/lib/meta/portfolio-admin.functions.ts", "utf8");
    const metaFns = await fs.readFile("src/lib/meta/meta.functions.ts", "utf8");
    const portfolio = await fs.readFile("src/lib/meta/portfolio.functions.ts", "utf8");

    // Cada leitura de autorização precisa excluir autorizações revogadas —
    // caso contrário o cache `pages` volta a alimentar "Contas disponíveis".
    expect(discovery.match(/\.is\("revoked_at", null\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(admin).toContain('.is("revoked_at", null)');
    expect(metaFns).toContain('.is("revoked_at", null)');
    expect(portfolio.match(/\.is\("revoked_at", null\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
