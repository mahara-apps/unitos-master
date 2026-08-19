import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getBrandBranding } from "@/lib/branding.functions";
import logoLight from "@/assets/brand/logo-unitos-light.png.asset.json";
import logoDark from "@/assets/brand/logo-unitos-dark.png.asset.json";
import mark from "@/assets/brand/mark-unitos.png.asset.json";

export type BrandBranding = {
  logoLight: string;
  logoDark: string;
  icon: string;
  logoLightCustom: boolean;
  logoDarkCustom: boolean;
  iconCustom: boolean;
  paths: { logo_light: string | null; logo_dark: string | null; icon: string | null };
};

const DEFAULTS = {
  logoLight: logoLight.url,
  logoDark: logoDark.url,
  icon: mark.url,
};

async function sign(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("brand-assets")
    .createSignedUrl(path, 60 * 60 * 6);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export function useBrandBranding(brandId: string | null | undefined): BrandBranding {
  const fetcher = useServerFn(getBrandBranding);
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  const paths = useQuery({
    queryKey: ["brand-branding", brandId],
    queryFn: () => fetcher({ data: { brandId: brandId! } }),
    enabled: !!brandId && hasSession,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const [signed, setSigned] = useState<{
    light: string | null;
    dark: string | null;
    icon: string | null;
  }>({ light: null, dark: null, icon: null });

  useEffect(() => {
    let alive = true;
    const p = paths.data;
    if (!p) {
      setSigned({ light: null, dark: null, icon: null });
      return;
    }
    Promise.all([sign(p.logo_light), sign(p.logo_dark), sign(p.icon)]).then(
      ([light, dark, icon]) => {
        if (alive) setSigned({ light, dark, icon });
      },
    );
    return () => {
      alive = false;
    };
  }, [paths.data]);

  return {
    logoLight: signed.light ?? DEFAULTS.logoLight,
    logoDark: signed.dark ?? DEFAULTS.logoDark,
    icon: signed.icon ?? DEFAULTS.icon,
    logoLightCustom: !!signed.light,
    logoDarkCustom: !!signed.dark,
    iconCustom: !!signed.icon,
    paths: {
      logo_light: paths.data?.logo_light ?? null,
      logo_dark: paths.data?.logo_dark ?? null,
      icon: paths.data?.icon ?? null,
    },
  };
}
