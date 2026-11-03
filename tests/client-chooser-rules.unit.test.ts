import { describe, expect, it } from "vitest";
import { visibleClientsFor } from "@/lib/client-chooser-rules";

const clients = [
  { id: "b", name: "Beta" },
  { id: "a", name: "Alfa" },
  { id: "c", name: "Casa" },
];

describe("escolha de cliente em Todos os clientes", () => {
  it("colaborador só vê os clientes atribuídos", () => {
    expect(visibleClientsFor(clients, new Set(["c"])).map((c) => c.id)).toEqual(["c"]);
  });
  it("Owner/Admin veem todos, em ordem alfabética", () => {
    expect(visibleClientsFor(clients, null).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
  it("sem atribuição, não vê nenhum", () => {
    expect(visibleClientsFor(clients, new Set())).toEqual([]);
  });
});
