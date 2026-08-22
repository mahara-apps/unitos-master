import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { getLoginLogoFn } from "@/lib/login-branding.functions";
import { BRAND_FALLBACK, BRAND_LOGO_RATIO, BrandLogo } from "@/components/brand/brand-logo";

/**
 * Logo dedicada da TELA DE LOGIN.
 *
 * Fonte: Configurações → Agência → Identidade visual → "Logo da tela de login".
 * Sem upload configurado, cai no asset padrão do sistema (fallback local).
 * O container reserva 600x180 (10:3) desde o primeiro render.
 */
export const LOGIN_LOGO_URL: string = BRAND_FALLBACK.light;

export function LoginLogo({ className }: { className?: string }) {
  const fetchLogo = useServerFn(getLoginLogoFn);
  const q = useQuery({
    queryKey: ["login-logo"],
    queryFn: () => fetchLogo(),
    staleTime: 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: false,
  });

  return (
    <BrandLogo
      src={q.data?.url ?? null}
      fallbackSrc={LOGIN_LOGO_URL}
      ratio={BRAND_LOGO_RATIO}
      alt="Logo"
      eager
      align="left"
      className={cn("w-full max-w-[360px] xl:max-w-[420px]", className)}
    />
  );
}
