import { describe, expect, it } from "vitest";
import fs from "node:fs";

const sidebar = fs.readFileSync("src/components/app-sidebar.tsx", "utf8");

function groupBlock(label: string, nextLabel: string) {
  const start = sidebar.indexOf(`label: "${label}"`);
  const end = sidebar.indexOf(`label: "${nextLabel}"`, start + 1);
  return sidebar.slice(start, end);
}

describe("grupos do menu lateral", () => {
  it("mantém Gestão entre Visão e Produção", () => {
    const vision = sidebar.indexOf('label: "Visão"');
    const management = sidebar.indexOf('label: "Gestão"');
    const production = sidebar.indexOf('label: "Produção"');
    const intelligence = sidebar.indexOf('label: "Inteligência"');

    expect(vision).toBeGreaterThan(-1);
    expect(vision).toBeLessThan(management);
    expect(management).toBeLessThan(production);
    expect(production).toBeLessThan(intelligence);
    expect(sidebar).not.toContain('label: "Trabalho"');
  });

  it("coloca Projetos e Tarefas somente em Gestão", () => {
    const management = groupBlock("Gestão", "Produção");
    const production = groupBlock("Produção", "Inteligência");

    expect(management).toContain('title: "Projetos"');
    expect(management).toContain('title: "Tarefas"');
    expect(management).toContain('badge: "tasks-pending"');
    expect(production).not.toContain('title: "Projetos"');
    expect(production).not.toContain('title: "Tarefas"');
  });

  it("mantém os módulos operacionais em Produção e na ordem definida", () => {
    const production = groupBlock("Produção", "Inteligência");
    const calendar = production.indexOf('title: "Calendário"');
    const plans = production.indexOf('title: "Pautas"');
    const content = production.indexOf('title: "Conteúdo"');
    const paidMedia = production.indexOf('title: "Mídia paga"');

    expect(calendar).toBeGreaterThan(-1);
    expect(calendar).toBeLessThan(plans);
    expect(plans).toBeLessThan(content);
    expect(content).toBeLessThan(paidMedia);
  });
});