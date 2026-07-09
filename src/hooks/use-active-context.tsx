import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type ActiveContextValue = {
  brandId: string | null;
  clientId: string | null;
  setBrandId: (id: string | null) => void;
  setClientId: (id: string | null) => void;
};

const Ctx = createContext<ActiveContextValue | null>(null);

const BRAND_KEY = "nx.brand";
const CLIENT_KEY = "nx.client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const readUuid = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(key);
  if (v && UUID_RE.test(v)) return v;
  if (v) localStorage.removeItem(key);
  return null;
};

export function ActiveContextProvider({ children }: { children: ReactNode }) {
  const [brandId, setBrandIdState] = useState<string | null>(null);
  const [clientId, setClientIdState] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setBrandIdState(readUuid(BRAND_KEY));
    setClientIdState(readUuid(CLIENT_KEY));
  }, []);

  const setBrandId = useCallback((id: string | null) => {
    setBrandIdState(id);
    if (typeof window === "undefined") return;
    if (id) localStorage.setItem(BRAND_KEY, id);
    else localStorage.removeItem(BRAND_KEY);
    setClientIdState(null);
    localStorage.removeItem(CLIENT_KEY);
  }, []);

  const setClientId = useCallback((id: string | null) => {
    setClientIdState(id);
    if (typeof window === "undefined") return;
    if (id) localStorage.setItem(CLIENT_KEY, id);
    else localStorage.removeItem(CLIENT_KEY);
  }, []);

  const value = useMemo(
    () => ({ brandId, clientId, setBrandId, setClientId }),
    [brandId, clientId, setBrandId, setClientId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveContext(): ActiveContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useActiveContext requires <ActiveContextProvider>");
  return v;
}