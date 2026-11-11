import { describe, expect, it } from "vitest";
import { moveToPosition } from "@/lib/reorder";
const ids = ["a", "b", "c", "d"];
describe("moveToPosition", () => {
  it("move para #1", () => expect(moveToPosition(ids, "c", 1)).toEqual(["c", "a", "b", "d"]));
  it("move para baixo", () => expect(moveToPosition(ids, "a", 3)).toEqual(["b", "c", "a", "d"]));
  it("limita acima de N ao final", () => expect(moveToPosition(ids, "b", 99)).toEqual(["a", "c", "d", "b"]));
  it("limita abaixo de 1 ao topo", () => expect(moveToPosition(ids, "d", 0)).toEqual(["d", "a", "b", "c"]));
  it("id inexistente não muda", () => expect(moveToPosition(ids, "z", 1)).toEqual(ids));
});
