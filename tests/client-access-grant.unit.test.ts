import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { noClientAccessMessage, parseNoClientAccess, isNoClientAccessMessage } from "@/lib/client-access-error";

const C = "11111111-1111-1111-1111-111111111111";
const U = "22222222-2222-2222-2222-222222222222";
const T = "33333333-3333-3333-3333-333333333333";
const sql = readFileSync(
  "supabase/migrations/20261123115103_26610864-1f6e-4381-aa78-5d503118a842.sql",
  "utf8",
);

describe("liberar acesso ao cliente pela tarefa", () => {
  it("erro carrega cliente, pessoa e tarefa", () => {
    expect(parseNoClientAccess(new Error(noClientAccessMessage(C, U, T)))).toEqual({ clientId: C, userId: U, taskId: T });
    expect(parseNoClientAccess(new Error(noClientAccessMessage(C, U, null)))?.taskId).toBeNull();
    expect(isNoClientAccessMessage("Outro erro")).toBe(false);
  });
  it("Manager só libera User e só em cliente que acessa", () => {
    expect(sql).toMatch(/v_actor = 'manager' AND v_target = 'user' AND public\.can_access_client\(_client_id, auth\.uid\(\)\)/);
  });
  it("User não libera (apenas Super Admin/Admin/Manager)", () => {
    expect(sql).toMatch(/IF v_actor IN \('super_admin','admin'\) THEN RETURN true/);
    expect(sql).not.toMatch(/v_actor = 'user'.*RETURN true/);
  });
  it("liberar não altera papel nem perfil", () => {
    expect(sql).not.toMatch(/UPDATE public\.brand_members/);
    expect(sql).not.toMatch(/access_profiles/);
  });
  it("liberação é idempotente e pedido aprovado atribui só se a tarefa estiver sem responsável", () => {
    expect(sql).toMatch(/ON CONFLICT \(client_id, user_id\) DO NOTHING/);
    expect(sql).toMatch(/SET assignee_id = r\.user_id WHERE id = r\.task_id AND assignee_id IS NULL/);
  });
});
