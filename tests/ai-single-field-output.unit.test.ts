import { describe, expect, it } from "vitest";
import {
  normalizeStoredSingleField,
  parseSingleFieldOutput,
} from "@/lib/ai-single-field-output";

const LONG_TEXT = "Orientação visual objetiva, detalhada e pronta para o designer.";

describe("parseSingleFieldOutput", () => {
  it.each(["visual_direction", "script", "caption"])(
    "aceita JSON válido para %s",
    (key) => {
      expect(parseSingleFieldOutput(JSON.stringify({ [key]: LONG_TEXT }), key)).toEqual({
        value: LONG_TEXT,
        disposition: "structured",
      });
    },
  );

  it("aceita JSON em cerca Markdown", () => {
    expect(
      parseSingleFieldOutput(`\`\`\`json\n${JSON.stringify({ script: LONG_TEXT })}\n\`\`\``, "script"),
    ).toMatchObject({ value: LONG_TEXT, disposition: "structured" });
  });

  it("aceita prosa legítima sem marcadores estruturais", () => {
    expect(parseSingleFieldOutput(LONG_TEXT, "caption")).toMatchObject({
      value: LONG_TEXT,
      disposition: "plain_text",
    });
  });

  it("recupera o padrão da Casa 8 com aspas internas não escapadas", () => {
    const raw =
      '{\n  "visual_direction": "Stories 9:16 vertical. Headline curta ("Resultado natural, 30 dias depois" ou similar). A foto é o herói visual."\n}';
    expect(parseSingleFieldOutput(raw, "visual_direction")).toEqual({
      value:
        'Stories 9:16 vertical. Headline curta ("Resultado natural, 30 dias depois" ou similar). A foto é o herói visual.',
      disposition: "recovered_envelope",
    });
  });

  it.each([
    '{"visual_direction":{"palette":["azul"]}}',
    '{"visual_direction":["texto longo o bastante para não ser prosa curta"]}',
    '{"outra_coisa":"texto longo o bastante para passar do limite mínimo"}',
    '{"visual_direction":"texto suficientemente longo e válido","extra":true}',
    '{"visual_direction":"resposta truncada sem fechamento',
    "",
  ])("rejeita estrutura incompatível ou ambígua", (raw) => {
    expect(parseSingleFieldOutput(raw, "visual_direction")).toBeNull();
  });

  it("não confunde texto com chaves internas com envelope JSON", () => {
    const prose = "Use blocos {assim} apenas como referência visual no layout final.";
    expect(parseSingleFieldOutput(prose, "visual_direction")).toMatchObject({
      value: prose,
      disposition: "plain_text",
    });
  });

  it("preserva acentos, aspas e quebras de linha em PT-BR", () => {
    const value = 'Direção “clínico-acolhedora”.\nTítulo: Olhar descansado e você.';
    expect(parseSingleFieldOutput(JSON.stringify({ caption: value }), "caption")?.value).toBe(value);
  });

  it("normaliza legado reconhecido e preserva valor ambíguo byte a byte", () => {
    const envelope = JSON.stringify({ visual_direction: LONG_TEXT });
    const ambiguous = '{"visual_direction":"texto suficientemente longo","extra":true}';
    expect(normalizeStoredSingleField(envelope, "visual_direction")).toBe(LONG_TEXT);
    expect(normalizeStoredSingleField(ambiguous, "visual_direction")).toBe(ambiguous);
  });
});