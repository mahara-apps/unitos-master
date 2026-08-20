import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { getLoginLogoFn } from "@/lib/login-branding.functions";
import loginLogoAsset from "@/assets/brand/logo-unitos-light.png.asset.json";

/**
 * Logo dedicada da TELA DE LOGIN.
 *
 * Fonte: Configurações → Agência → Identidade visual → "Logo da tela de login".
 * Sem upload configurado, cai no asset padrão do sistema.
 */
export const LOGIN_LOGO_URL: string = loginLogoAsset.url;

export function LoginLogo({ className }: { className?: string }) {
  const fetchLogo = useServerFn(getLoginLogoFn);
  const q = useQuery({
    queryKey: ["login-logo"],
    queryFn: () => fetchLogo(),
    staleTime: 60 * 60_000,
    retry: false,
  });

  return (
    <img
      src={q.data?.url ?? LOGIN_LOGO_URL}
      alt="Logo"
      draggable={false}
      loading="eager"
      decoding="async"
      className={cn(
        "block h-auto w-[180px] max-w-full select-none object-contain object-left sm:w-[200px] xl:w-[220px]",
        className,
      )}
    />
  );
}
