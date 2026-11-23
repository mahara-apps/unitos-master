import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { clientScopeLabel, roleNeedsClientScope, summarizeClientChange } from "@/lib/member-clients";

const sql = readFileSync("supabase/migrations/20261123165435_f1b6d249-b013-4def-8e86-7115c8ab98b8.sql", "utf8");
const fn = (name: string) => {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  const end = sql.indexOf("$$;", sql.indexOf("BEGIN", start));
  return sql.slice(start, end > 0 ? end : undefined);
};
const apply = fn("_apply_member_clients");

describe("clientes que a pessoa atende (Equipe)", () => {
  it("só Manager e User têm escopo por cliente", () => {
    expect(roleNeedsClientScope("manager")).toBe(true);
    expect(roleNeedsClientScope("user")).toBe(true);
    expect(roleNeedsClientScope("admin")).toBe(false);
    expect(roleNeedsClientScope("owner")).toBe(false);
  });

  it("Manager só libera para User", () => {
    expect(apply).toMatch(/IF v_actor = 'manager' AND v_target <> 'user' THEN\s+RAISE EXCEPTION/);
  });

  it("User não libera clientes para ninguém", () => {
    expect(apply).toMatch(/v_actor NOT IN \('super_admin','admin','manager'\)/);
  });

  it("Manager só libera clientes que ele mesmo acessa", () => {
    expect(apply).toMatch(/v_actor_all OR public\.can_access_client\(c\.id, _actor\)/);
    expect(apply).toMatch(/Há clientes que você não pode liberar/);
  });

  it("Manager sem 'todos' não liga nem desliga 'Todos os clientes' de outra pessoa", () => {
    expect(apply).toMatch(/v_flag := COALESCE\(v_before, false\)/);
    expect(apply).toMatch(/IF NOT v_actor_all AND v_before AND NOT COALESCE\(_all, false\) THEN/);
  });

  it("liberar não altera papel nem perfil de módulos", () => {
    expect(apply).not.toMatch(/SET role/);
    expect(apply).not.toMatch(/access_profile/);
    expect(apply).toMatch(/UPDATE public\.brand_members SET all_clients = v_flag/);
  });

  it("remover nunca toca vínculos do Portal e inserir é idempotente", () => {
    expect(apply).toMatch(/DELETE FROM public\.client_members[\s\S]*role <> 'portal_client'/);
    expect(apply).toMatch(/ON CONFLICT \(client_id, user_id\) DO NOTHING/);
  });

  it("'Todos os clientes' inclui clientes futuros para Manager/User", () => {
    const row = fn("can_access_client_row");
    expect(row).toMatch(/IF v_role IN \('manager', 'user'\) THEN\s+IF v_all THEN RETURN true;/);
  });

  it("'Todos os clientes' não pode ser ligado direto pela API", () => {
    expect(sql).toMatch(/current_user IN \('authenticated', 'anon'\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\._apply_member_clients\([^)]*\) FROM PUBLIC, anon, authenticated/);
  });

  it("convite aplica os clientes no aceite com a autoridade de quem convidou", () => {
    const accept = fn("accept_brand_invite");
    expect(accept).toMatch(/_apply_member_clients\(v_invite\.invited_by/);
  });

  it("resumo do que muda ao salvar", () => {
    expect(summarizeClientChange({ all: false, clientIds: ["a", "b"] }, { all: false, clientIds: ["b", "c", "d"] })).toBe("+2 clientes, −1 cliente");
    expect(summarizeClientChange({ all: false, clientIds: [] }, { all: true, clientIds: [] })).toBe("Passa a ver todos os clientes");
    expect(summarizeClientChange({ all: false, clientIds: ["a"] }, { all: false, clientIds: ["a"] })).toBeNull();
  });

  it("lista da Equipe mostra 'Nenhum cliente' em destaque para Manager sem clientes", () => {
    expect(clientScopeLabel({ role: "manager", allClients: false, clientCount: 0 })).toEqual({ label: "Nenhum cliente", empty: true });
    expect(clientScopeLabel({ role: "user", allClients: true, clientCount: 0 }).label).toBe("Todos os clientes");
    expect(clientScopeLabel({ role: "user", allClients: false, clientCount: 3 }).label).toBe("3 clientes");
  });

  it("textos não prometem 'todos os clientes' ao Manager", () => {
    const shared = readFileSync("src/components/settings/team-shared.tsx", "utf8");
    const managerLines = shared.split("\n").filter((l) => /^\s+manager:/.test(l) || /Gerencia a operação/.test(l));
    expect(managerLines.join("\n")).not.toMatch(/em todos os clientes|e todos os clientes|Todos os clientes da marca/);
  });
});
