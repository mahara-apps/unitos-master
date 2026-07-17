import { useTheme } from "@/components/theme-provider";
import { useActiveContext } from "@/hooks/use-active-context";
import { useBrandBranding } from "@/hooks/use-brand-branding";
import { cn } from "@/lib/utils";

type Props = {
  variant?: "full" | "mark";
  className?: string;
  eager?: boolean;
};

export function UnitosLogo({ variant = "full", className, eager }: Props) {
  const { resolvedTheme } = useTheme();
  const { brandId } = useActiveContext();
  const branding = useBrandBranding(brandId);
  const src =
    variant === "mark"
      ? branding.icon
      : resolvedTheme === "dark"
        ? branding.logoDark
        : branding.logoLight;
  return (
    <img
      src={src}
      alt="Unitos"
      draggable={false}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cn("select-none object-contain", className)}
    />
  );
}