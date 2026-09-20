import { describe, expect, it } from "vitest";
import {
  sanitizeOperationalMetadata,
  sanitizeOperationalText,
} from "../src/lib/operational-audit.server";

describe("auditoria operacional", () => {
  it("remove chaves e bearer tokens das mensagens", () => {
    expect(sanitizeOperationalText("Bearer abcdefghijkl re_123456789")).toBe(
      "[redacted] [redacted]",
    );
  });

  it("remove segredos aninhados e limita coleções", () => {
    const out = sanitizeOperationalMetadata({
      apiKey: "secret-value",
      nested: { authorization: "Bearer unsafe-token", safe: "ok" },
      items: Array.from({ length: 30 }, (_, index) => index),
    });
    expect(out.apiKey).toBe("[redacted]");
    expect(out.nested).toEqual({ authorization: "[redacted]", safe: "ok" });
    expect(out.items).toHaveLength(20);
  });

  it("limita campos textuais", () => {
    expect(sanitizeOperationalText("x".repeat(700))).toHaveLength(500);
  });
});
