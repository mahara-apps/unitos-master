import { describe, expect, it } from "vitest";
import { APICallError } from "ai";
import { salvageStructuredOutput } from "@/lib/ai-output-salvage";
import { isSchemaRejection, normalizePlanBatch } from "@/lib/monthly-plan-salvage";
import { z } from "zod";

const schema = z.object({ topics: z.array(z.object({ topic_title: z.string() })) });

function groqRejection(failed: unknown) {
  return new APICallError({
    message:
      "Generated JSON does not match the expected schema. jsonschema: '/topics/12' missing properties: 'suggested_weekday'",
    url: "https://api.groq.com",
    requestBodyValues: {},
    statusCode: 400,
    responseBody: JSON.stringify({ error: { failed_generation: JSON.stringify(failed) } }),
    isRetryable: false,
  });
}

describe("recuperação de lote da pauta", () => {
  it("aceita ideia sem dia, hora e justificativa como nulos", () => {
    const err = groqRejection({
      title: "",
      topics: [
        { topic_title: "A", content_format: "reels", angle: "x", suggested_weekday: 2, suggested_time: "10:00", slot_rationale: "r" },
        { topic_title: "B", content_format: "carrossel", angle: "y" },
      ],
    });
    const out = salvageStructuredOutput(err, schema as never, normalizePlanBatch) as ReturnType<
      typeof normalizePlanBatch
    >;
    expect(out?.topics).toHaveLength(2);
    expect(out?.topics[1]).toMatchObject({
      topic_title: "B",
      suggested_weekday: null,
      suggested_time: null,
      slot_rationale: null,
    });
  });

  it("descarta ideia sem título ou com formato inválido", () => {
    const out = normalizePlanBatch({
      topics: [{ content_format: "reels" }, { topic_title: "X", content_format: "video" }, { topic_title: "Y", content_format: "feed" }],
    });
    expect(out?.topics.map((t) => t.topic_title)).toEqual(["Y"]);
  });

  it("sem conteúdo aproveitável não recupera", () => {
    expect(normalizePlanBatch({ topics: [] })).toBeNull();
    expect(normalizePlanBatch({ topics: [{ content_format: "reels" }] })).toBeNull();
  });

  it("reconhece recusa por schema e ignora outros erros", () => {
    expect(isSchemaRejection(groqRejection({}))).toBe(true);
    expect(isSchemaRejection(new Error("Rate limit reached"))).toBe(false);
  });
});
