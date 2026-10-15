import { describe, expect, it } from "vitest";
import { splitQuotaIntoBatches, totalSlots } from "@/lib/monthly-plan-distribution";
import { PLAN_BATCH_SIZE } from "@/lib/monthly-plan-ai-options";
import { assertNotTruncated } from "@/lib/ai/output-budget";
import { classifyAiError } from "@/lib/ai-failures.server";

describe("pauta em lotes", () => {
  const quota = {
    instagram: { feed: 20, reels: 12, stories: 10, carrossel: 8 },
    facebook: { feed: 12 },
  };

  it("62 peças viram lotes de no máximo 15 com a soma exata", () => {
    const batches = splitQuotaIntoBatches(quota, PLAN_BATCH_SIZE);
    expect(PLAN_BATCH_SIZE).toBe(15);
    expect(batches.map(totalSlots)).toEqual([15, 15, 15, 15, 2]);
    const sum = (ch: string, f: string) =>
      batches.reduce((s, b) => s + ((b[ch] as Record<string, number> | undefined)?.[f] ?? 0), 0);
    expect(sum("instagram", "feed")).toBe(20);
    expect(sum("instagram", "carrossel")).toBe(8);
    expect(sum("facebook", "feed")).toBe(12);
  });

  it("cada lote mistura canais e formatos", () => {
    const [first] = splitQuotaIntoBatches(quota, PLAN_BATCH_SIZE);
    expect(Object.keys(first!)).toEqual(["instagram", "facebook"]);
    expect(Object.keys(first!.instagram!).length).toBe(4);
  });

  it("pauta de até 15 peças segue em um lote", () => {
    expect(splitQuotaIntoBatches({ instagram: { feed: 15 } }, 15)).toHaveLength(1);
  });
});

describe("resposta cortada por tamanho", () => {
  it("vira output_truncated, sem repetir nem trocar de provedor", () => {
    let err: unknown;
    try {
      assertNotTruncated("length");
    } catch (e) {
      err = e;
    }
    expect(classifyAiError(err)).toEqual({ kind: "output_truncated", retryable: false });
    expect(() => assertNotTruncated("stop")).not.toThrow();
  });
});
