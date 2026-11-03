import { describe, expect, it } from "vitest";
import { normalizeRename } from "@/lib/inline-rename";

describe("normalizeRename", () => {
  it("salva o novo nome aparado", () => {
    expect(normalizeRename("  Revisar arte  ", "Arte", 200)).toBe("Revisar arte");
  });
  it("não salva nome vazio", () => {
    expect(normalizeRename("   ", "Arte", 200)).toBeNull();
  });
  it("não salva quando o nome não mudou", () => {
    expect(normalizeRename("Arte ", "Arte", 200)).toBeNull();
  });
  it("corta no limite", () => {
    expect(normalizeRename("abcdef", "x", 3)).toBe("abc");
  });
});
