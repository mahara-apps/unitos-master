export { consolidate, tryDirectAnswer } from "./consolidate";
export type { BrainConsolidated } from "./consolidate";
export type { ChatAttachmentMeta } from "./llm.server";
// llm.server.ts é importado dinamicamente na Brain API para manter o boundary server-only.