import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Configurações — regressões funcionais", () => {
  const landing = read("src/routes/_authenticated/settings.index.tsx");
  const layout = read("src/routes/_authenticated/settings.tsx");

  it("mantém os oito destinos da página inicial com rotas existentes", () => {
    const destinations = [
      "profile",
      "notifications",
      "identity",
      "team",
      "permissions",
      "work-statuses",
      "access-log",
      "logs",
    ];

    for (const destination of destinations) {
      expect(landing).toContain(`\"/settings/${destination}\"`);
      expect(read(`src/routes/_authenticated/settings.${destination}.tsx`)).toContain(
        `createFileRoute(\"/_authenticated/settings/${destination}\")`,
      );
    }
  });

  it("mantém a mesma lista administrativa nos cards e na navegação", () => {
    for (const destination of [
      "identity",
      "team",
      "permissions",
      "work-statuses",
      "access-log",
      "logs",
    ]) {
      expect(landing).toContain(`to: \"/settings/${destination}\"`);
      expect(layout).toContain(`to: \"/settings/${destination}\"`);
    }
  });

  it("não considera Início ativo em todas as subrotas", () => {
    expect(layout).toContain('if (to === "/settings") return pathname === to;');
  });

  it("distingue erro de autorização de carregamento e acesso negado", () => {
    expect(landing).toContain("isError ?");
    expect(layout).toContain("isError && currentTab?.admin");
    expect(layout).toContain("Não foi possível verificar seu acesso");
  });

  it("mantém a navegação móvel em uma linha rolável e identificada", () => {
    expect(layout).toContain('aria-label="Navegação das configurações"');
    expect(layout).toContain("flex-nowrap");
    expect(layout).toContain("overflow-x-auto");
  });
});
