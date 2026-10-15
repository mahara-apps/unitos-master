import { describe, expect, it } from "vitest";
import { buildAuthUrlPatch, checkAuthUrls } from "@/lib/installation/auth-urls";

describe("endereços de login da instalação", () => {
  it("domínio vira endereço principal e autoriza /reset-password", () => {
    const r = buildAuthUrlPatch("unitos.casa8agencia.com", null);
    expect(r.ok && r.patch.site_url).toBe("https://unitos.casa8agencia.com");
    expect(r.ok && r.patch.uri_allow_list.split(",")).toContain(
      "https://unitos.casa8agencia.com/reset-password",
    );
  });

  it("mantém autorizados existentes e descarta localhost", () => {
    const r = buildAuthUrlPatch("a.com", "https://preview.a.com/**,http://localhost:3000");
    const list = r.ok ? r.patch.uri_allow_list.split(",") : [];
    expect(list).toContain("https://preview.a.com/**");
    expect(list.some((u) => u.includes("localhost"))).toBe(false);
  });

  it("recusa domínio vazio ou localhost", () => {
    expect(buildAuthUrlPatch("", null).ok).toBe(false);
    expect(buildAuthUrlPatch("http://localhost:3000", null).ok).toBe(false);
  });

  it("conferência reprova localhost:3000 e aprova domínio correto", () => {
    expect(checkAuthUrls("a.com", { site_url: "http://localhost:3000", uri_allow_list: "" }).ok).toBe(false);
    expect(
      checkAuthUrls("a.com", { site_url: "https://a.com", uri_allow_list: "https://a.com/reset-password" }).ok,
    ).toBe(true);
  });
});
