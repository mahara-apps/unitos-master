import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const board = readFileSync("src/components/projects/pauta-board.tsx", "utf8");

describe("arraste das peças no quadro do projeto", () => {
  it("mostra a peça acompanhando o cursor e indica somente destinos do mesmo pipeline", () => {
    expect(board).toContain("<DragOverlay>");
    expect(board).toContain("<PautaCard item={activeItem}");
    expect(board).toContain("onDragStart={(event) => setActiveId(String(event.active.id))}");
    expect(board).toContain("onDragCancel={() => setActiveId(null)}");
    expect(board).toContain('drag.isDragging && "opacity-40"');
    expect(board).toContain("activePipelineId === stage.pipelineId");
    expect(board).toContain("drop.isOver && validTarget");
  });

  it("não altera a peça se o arraste for cancelado ou o destino for inválido", () => {
    expect(board).toContain("if (moving || !onMoveItem || !event.over) return");
    expect(board).toContain("active.pipelineId !== target.pipelineId");
    expect(board).toContain("active.stageId === stageId");
    expect(board).toContain("onMoveItem(postId, stageId, lastPosition + 1024)");
    expect(board).toContain("const enabled = !!item.postId && !!item.pipelineId && !!item.stageId");
  });
});
