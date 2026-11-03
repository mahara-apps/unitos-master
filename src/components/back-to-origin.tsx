import { useEffect, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { previousEntry, retitleTrail, visitTrail, type TrailEntry } from "@/lib/nav-trail";

const KEY = "unitos:nav-trail";

function read(): TrailEntry[] {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as TrailEntry[]) : [];
  } catch {
    return [];
  }
}
function write(trail: TrailEntry[]) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(trail));
  } catch {
    /* armazenamento indisponível: o botão só não aparece */
  }
}

/** "← Voltar para [origem]": leva para a tela anterior com filtros, aba e rolagem. */
export function BackToOrigin({ title }: { title: string }) {
  const router = useRouter();
  const location = useRouterState({ select: (s) => s.location });
  const href = location.href;
  const path = location.pathname;
  const [prev, setPrev] = useState<TrailEntry | null>(null);

  useEffect(() => {
    const next = visitTrail(read(), { href, path, title });
    write(next);
    setPrev(previousEntry(next));
    // título é tratado no efeito abaixo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [href, path]);

  useEffect(() => {
    const next = retitleTrail(read(), href, title);
    write(next);
  }, [href, title]);

  if (!prev) return null;
  const label = prev.title?.trim() || "a tela anterior";
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
      title={`Voltar para ${label}`}
      onClick={() => void router.navigate({ href: prev.href })}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      <span className="max-w-[180px] truncate">Voltar para {label}</span>
    </Button>
  );
}
