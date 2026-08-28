import { cn } from "@/lib/utils";
import wordmarkAsset from "@/assets/unitos-wordmark.png.asset.json";
import markAsset from "@/assets/unitos-mark.png.asset.json";

/**
 * LOGO OFICIAL DO UNITOS (única marca institucional do sistema).
 *
 * É a logo oficial enviada pela agência, aplicada como MÁSCARA CSS colorida
 * por `currentColor`. Por isso:
 * - funciona em fundo claro e escuro com um único arquivo (nada de variantes
 *   light/dark para manter);
 * - nunca aparece "quebrada" como <img> (a máscara falha para transparente,
 *   e o container de `BrandLogo` já reserva a proporção);
 * - não depende de branding configurado por instalação.
 *
 * NÃO desenhar outra marca aqui. Esta é a única logo institucional.
 */

/** Proporção do wordmark oficial (largura / altura). */
export const UNITOS_WORDMARK_RATIO = 1909 / 544;
/** Proporção do ícone/mark (quadrado). */
export const UNITOS_MARK_RATIO = 1;

function MaskedLogo({
  url,
  className,
  label,
}: {
  url: string;
  className?: string;
  label: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("block h-full w-full", className)}
      style={{
        backgroundColor: "currentColor",
        maskImage: `url("${url}")`,
        WebkitMaskImage: `url("${url}")`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

export function UnitosMarkGlyph({ className }: { className?: string }) {
  return <MaskedLogo url={markAsset.url} className={className} label="Unitos" />;
}

export function UnitosWordmarkGlyph({ className }: { className?: string }) {
  return <MaskedLogo url={wordmarkAsset.url} className={className} label="Unitos" />;
}
