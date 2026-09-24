import { describe, expect, it } from "vitest";
import { MODULE_KEYS, MODULES } from "@/lib/module-permissions";
import { SIDEBAR_ALLOWED_URLS } from "@/lib/permissions";
import { readFileSync } from "node:fs";

describe("Central de mensagens como módulo/recurso próprio", () => {
  it("existe um módulo Mensagens independente do Chat com IA", () => {
    expect(MODULE_KEYS).toContain("messages");
    const messages = MODULES.find((m) => m.key === "messages");
    expect(messages?.urls).toEqual(["/messages"]);
    const chat = MODULES.find((m) => m.key === "chat");
    expect(chat?.urls).toEqual(["/chat"]);
  });

  it("a tela de mensagens está liberada para os papéis do workspace", () => {
    expect(SIDEBAR_ALLOWED_URLS.admin.has("/messages")).toBe(true);
    expect(SIDEBAR_ALLOWED_URLS.user.has("/messages")).toBe(true);
  });

  it("identifica conversas lidas e não lidas e atualiza o contador em tempo real", () => {
    const list = readFileSync("src/components/messages/message-thread-list.tsx", "utf8");
    const layout = readFileSync("src/routes/_authenticated/messages.tsx", "utf8");
    const sidebar = readFileSync("src/components/app-sidebar.tsx", "utf8");
    expect(list).toContain("thread.unread > 99");
    expect(list).toContain("Lida");
    expect(layout).toContain("message-list:");
    expect(layout).toContain('["messages-unread", brandId]');
    expect(sidebar).toContain("message-badge:");
  });
});
