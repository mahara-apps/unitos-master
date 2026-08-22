import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import logoLightAsset from "@/assets/brand/logo-unitos-light.png.asset.json";
import logoDarkAsset from "@/assets/brand/logo-unitos-dark.png.asset.json";
import markAsset from "@/assets/brand/mark-unitos.png.asset.json";

/**
 * COMPONENTE ÚNICO DE BRANDING (login, sidebar e demais telas).
 *
 * Regras estruturais:
 * - o container reserva as dimensões (aspect-ratio) desde o primeiro render,
 *   portanto nunca há layout shift nem "logo crescendo" após o carregamento;
 * - o fallback local do Unitos é pintado imediatamente (sem skeleton);
 * - a logo da instalação só substitui o fallback depois de pré-carregada com
 *   sucesso, então URL vazia/inválida ou erro de rede nunca mostra imagem
 *   quebrada;
 * - o pré-carregamento é memoizado por URL, evitando fetch duplicado quando a
 *   mesma logo aparece em várias telas.
 */

/** Proporção original das logos do Unitos: 600x180 (10:3). */
export const BRAND_LOGO_RATIO = 600 / 180;
/** Proporção do ícone/mark (quadrado). */
export const BRAND_MARK_RATIO = 1;

export const BRAND_FALLBACK = {
  light: logoLightAsset.url as string,
  dark: logoDarkAsset.url as string,
  mark: markAsset.url as string,
};

const preloadCache = new Map<string, Promise<boolean>>();

function isUsableUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return false;
  return /^(https?:|blob:|data:|\/)/.test(trimmed);
}

function preload(url: string): Promise<boolean> {
  const cached = preloadCache.get(url);
  if (cached) return cached;
  const p = new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    const img = new window.Image();
    img.decoding = "async";
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = url;
  }).then((ok) => {
    if (!ok) preloadCache.delete(url);
    return ok;
  });
  preloadCache.set(url, p);
  return p;
}

export type BrandLogoProps = {
  /** URL da identidade da instalação (pode ser nula/inválida). */
  src?: string | null;
  /** Fallback local do Unitos. */
  fallbackSrc?: string;
  /** Proporção reservada no container (largura / altura). */
  ratio?: number;
  alt?: string;
  eager?: boolean;
  /** Classes do container (controle de largura/altura). */
  className?: string;
  /** Classes extra da imagem. */
  imgClassName?: string;
  /** Alinhamento horizontal da imagem dentro do container. */
  align?: "left" | "center";
};

export function BrandLogo({
  src,
  fallbackSrc = BRAND_FALLBACK.light,
  ratio = BRAND_LOGO_RATIO,
  alt = "Logo",
  eager = true,
  className,
  imgClassName,
  align = "left",
}: BrandLogoProps) {
  const remote = isUsableUrl(src) ? src.trim() : null;
  const [resolved, setResolved] = useState<string | null>(() =>
    remote && preloadCache.has(remote) ? remote : null,
  );

  useEffect(() => {
    if (!remote) {
      setResolved(null);
      return;
    }
    let alive = true;
    void preload(remote).then((ok) => {
      if (alive) setResolved(ok ? remote : null);
    });
    return () => {
      alive = false;
    };
  }, [remote]);

  return (
    <span
      className={cn("relative block w-full select-none overflow-hidden", className)}
      style={{ aspectRatio: String(ratio) }}
    >
      <img
        src={resolved ?? fallbackSrc}
        alt={alt}
        draggable={false}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onError={(e) => {
          const img = e.currentTarget;
          if (img.src !== fallbackSrc) img.src = fallbackSrc;
        }}
        className={cn(
          "absolute inset-0 h-full w-full object-contain",
          align === "left" ? "object-left" : "object-center",
          imgClassName,
        )}
      />
    </span>
  );
}
