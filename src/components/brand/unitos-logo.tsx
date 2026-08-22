import { useTheme } from "@/components/theme-provider";
import { useActiveContextOptional } from "@/hooks/use-active-context";
import { useBrandBranding } from "@/hooks/use-brand-branding";
import {
  BRAND_FALLBACK,
  BRAND_LOGO_RATIO,
  BRAND_MARK_RATIO,
  BrandLogo,
} from "@/components/brand/brand-logo";

type Props = {
  variant?: "full" | "mark";
  className?: string;
  eager?: boolean;
  align?: "left" | "center";
};

/**
 * Logo da instalação (sidebar e telas internas). Casca fina sobre `BrandLogo`:
 * dimensões reservadas, fallback local imediato e zero layout shift.
 */
export function UnitosLogo({ variant = "full", className, eager = true, align = "left" }: Props) {
  const { resolvedTheme } = useTheme();
  const { brandId } = useActiveContextOptional();
  const branding = useBrandBranding(brandId);
  const isMark = variant === "mark";
  const src = isMark
    ? branding.icon
    : resolvedTheme === "dark"
      ? branding.logoDark
      : branding.logoLight;
  const fallback = isMark
    ? BRAND_FALLBACK.mark
    : resolvedTheme === "dark"
      ? BRAND_FALLBACK.dark
      : BRAND_FALLBACK.light;

  return (
    <BrandLogo
      src={src}
      fallbackSrc={fallback}
      ratio={isMark ? BRAND_MARK_RATIO : BRAND_LOGO_RATIO}
      alt="Unitos"
      eager={eager}
      align={align}
      className={className}
    />
  );
}
