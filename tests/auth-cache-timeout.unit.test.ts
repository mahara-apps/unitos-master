import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const never = () => new Promise<never>(() => {});
const auth = { getUser: vi.fn(), getSession: vi.fn(), signOut: vi.fn() };
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));

describe("getCachedUser com sessão travada", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.resetModules(); vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => vi.useRealTimers());

  it("encerra em até 8s com AuthCheckTimeoutError quando getUser e getSession nunca respondem", async () => {
    auth.getUser.mockImplementation(never);
    auth.getSession.mockImplementation(never);
    const mod = await import("@/lib/auth-cache");
    const p = mod.getCachedUser({ force: true });
    const assertion = expect(p).rejects.toBeInstanceOf(mod.AuthCheckTimeoutError);
    await vi.advanceTimersByTimeAsync(8_000);
    await assertion;
  });

  it("usa a sessão local quando só a validação remota trava", async () => {
    auth.getUser.mockImplementation(never);
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    const mod = await import("@/lib/auth-cache");
    const p = mod.getCachedUser({ force: true });
    await vi.advanceTimersByTimeAsync(6_000);
    expect((await p)?.id).toBe("u1");
  });

  it("sem sessão real devolve null (não é timeout)", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const mod = await import("@/lib/auth-cache");
    expect(await mod.getCachedUser({ force: true })).toBeNull();
  });
});
