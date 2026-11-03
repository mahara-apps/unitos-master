import { describe, expect, it } from "vitest";
import { previousEntry, retitleTrail, visitTrail, type TrailEntry } from "@/lib/nav-trail";

const e = (path: string, search = "", title = path): TrailEntry => ({ href: path + search, path, title });

describe("trilha de navegação", () => {
  it("Voltar aponta para a página de onde a pessoa veio, com filtros", () => {
    let t: TrailEntry[] = [];
    t = visitTrail(t, e("/projects/abc", "?tab=jobs", "Projeto X"));
    t = visitTrail(t, e("/monthly-plan/p1", "", "Pauta"));
    t = visitTrail(t, e("/content", "?post=1", "Conteúdo"));
    expect(previousEntry(t)?.href).toBe("/monthly-plan/p1");
  });
  it("ao voltar, a página reaparece uma vez só e o Voltar segue para a anterior", () => {
    let t: TrailEntry[] = [];
    t = visitTrail(t, e("/projects/abc", "?tab=jobs"));
    t = visitTrail(t, e("/monthly-plan/p1"));
    t = visitTrail(t, e("/content"));
    t = visitTrail(t, e("/monthly-plan/p1"));
    expect(t.map((x) => x.path)).toEqual(["/projects/abc", "/monthly-plan/p1"]);
    expect(previousEntry(t)?.href).toBe("/projects/abc?tab=jobs");
  });
  it("mudar filtro na mesma página não cria um Voltar", () => {
    let t: TrailEntry[] = [];
    t = visitTrail(t, e("/tasks"));
    t = visitTrail(t, e("/tasks", "?view=kanban"));
    expect(previousEntry(t)).toBeNull();
    expect(t[0].href).toBe("/tasks?view=kanban");
  });
  it("entrou direto pelo link: sem Voltar", () => {
    expect(previousEntry(visitTrail([], e("/content")))).toBeNull();
  });
  it("título chega depois e é atualizado", () => {
    const t = retitleTrail(visitTrail([], e("/projects/abc", "", "")), "/projects/abc", "Projeto X");
    expect(t[0].title).toBe("Projeto X");
  });
});

import { setTrailScroll } from "@/lib/nav-trail";
describe("rolagem do Voltar", () => {
  it("guarda a rolagem só da página atual", () => {
    const trail = [{ href: "/a", path: "/a", title: "A" }, { href: "/b?x=1", path: "/b", title: "B" }];
    expect(setTrailScroll(trail, "/b?x=1", 640).at(-1)?.scrollY).toBe(640);
    expect(setTrailScroll(trail, "/a", 640)).toBe(trail);
  });
});
