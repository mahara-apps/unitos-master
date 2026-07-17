import { useTheme } from "@/components/theme-provider";
import logoLight from "@/assets/brand/logo-unitos-light.png.asset.json";
import logoDark from "@/assets/brand/logo-unitos-dark.png.asset.json";
import mark from "@/assets/brand/mark-unitos.png.asset.json";
import { cn } from "@/lib/utils";

type Props = {
  variant?: "full" | "mark";
  className?: string;
  eager?: boolean;
};

export function UnitosLogo({ variant = "full", className, eager }: Props) {
  const { resolvedTheme } = useTheme();
  const src =
    variant === "mark"
      ? mark.url
      : resolvedTheme === "dark"
        ? logoDark.url
        : logoLight.url;
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