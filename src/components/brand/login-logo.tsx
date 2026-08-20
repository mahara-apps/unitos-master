import { cn } from "@/lib/utils";

/**
 * Logo dedicada da TELA DE LOGIN.
 *
 * Para trocar por um asset exclusivo do login (separado das logos do restante
 * do sistema), suba o arquivo em `src/assets/brand/login/` e altere APENAS o
 * import abaixo. Nada mais precisa mudar.
 *
 * Recomendações do asset:
 * - Preferencial: SVG horizontal, fundo transparente, versão clara (para fundo escuro/azul).
 * - Alternativa PNG: horizontal em alta resolução, ~600x160 px (proporção ~3,75:1),
 *   fundo transparente.
 * - A exibição usa largura responsiva (~180–220 px) com `h-auto`, portanto a
 *   proporção real do arquivo é sempre preservada — qualquer aspect ratio funciona,
 *   sem distorção.
 */
import loginLogoAsset from "@/assets/brand/logo-unitos-light.png.asset.json";

export const LOGIN_LOGO_URL: string = loginLogoAsset.url;

export function LoginLogo({ className }: { className?: string }) {
  return (
    <img
      src={LOGIN_LOGO_URL}
      alt="Unitos"
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
