import { cn } from "@/lib/utils";

/**
 * LOGO INSTITUCIONAL PADRÃO DO UNITOS.
 *
 * É SVG inline (nenhuma requisição de rede, nenhum Storage, nenhum domínio ou
 * CDN de instalação). Por isso funciona em QUALQUER instalação, inclusive sem
 * branding configurado, e nunca pode aparecer "quebrada".
 *
 * Cores: usam `currentColor`, então a logo se adapta automaticamente a fundos
 * claros/escuros — não existem variantes light/dark de arquivo a manter.
 */

/** Proporção do wordmark (largura / altura). */
export const UNITOS_WORDMARK_RATIO = 600 / 180;
/** Proporção do ícone/mark (quadrado). */
export const UNITOS_MARK_RATIO = 1;

export function UnitosMarkGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="Unitos"
      className={cn("h-full w-full", className)}
    >
      <rect x="4" y="4" width="92" height="92" rx="24" fill="currentColor" opacity="0.12" />
      <path
        d="M30 28v26c0 11 9 20 20 20s20-9 20-20V28"
        fill="none"
        stroke="currentColor"
        strokeWidth="11"
        strokeLinecap="round"
      />
      <circle cx="50" cy="76" r="6" fill="currentColor" />
    </svg>
  );
}

export function UnitosWordmarkGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 600 180"
      role="img"
      aria-label="Unitos"
      className={cn("h-full w-full", className)}
    >
      <g transform="translate(8,40)">
        <rect width="100" height="100" rx="26" fill="currentColor" opacity="0.12" />
        <path
          d="M30 26v28c0 11 9 20 20 20s20-9 20-20V26"
          fill="none"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <circle cx="50" cy="78" r="6" fill="currentColor" />
      </g>
      <text
        x="132"
        y="118"
        fill="currentColor"
        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        fontSize="86"
        fontWeight="700"
        letterSpacing="2"
      >
        unitos
      </text>
    </svg>
  );
}
