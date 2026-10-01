import { describe, expect, it } from "vitest";

import { parseCopilotOutput } from "@/lib/copilot-job.server";

const valid = {
  title: "Uma campanha que aproxima pessoas",
  content: "Conheça uma proposta pensada para fortalecer vínculos e gerar resultados consistentes.",
  hashtags: ["estrategia", "conteudo", "marca", "resultados"],
};

describe("contrato de saída do Copilot", () => {
  it("aceita JSON válido em pt-BR", () => {
    expect(parseCopilotOutput(JSON.stringify(valid))).toEqual(valid);
  });

  it("recupera somente um envelope JSON completo e fiel", () => {
    expect(parseCopilotOutput(`Resposta:\n${JSON.stringify(valid)}\nFim`)).toEqual(valid);
  });

  it.each(["", "texto bruto sem contrato", '{"title":"incompleto"}', "{}"])(
    "rejeita resposta inválida: %s",
    (raw) => expect(() => parseCopilotOutput(raw)).toThrow(/ai_invalid_output/),
  );

  it("rejeita conteúdo predominantemente em inglês", () => {
    expect(() =>
      parseCopilotOutput(
        JSON.stringify({
          title: "Growth plan",
          content: "The campaign will connect with your audience and bring the insights that they seek through this content.",
          hashtags: ["growth", "insights", "content", "campaign"],
        }),
      ),
    ).toThrow(/ai_invalid_output/);
  });
});