import { createContext, useContext } from "react";
import { Home, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/* ------------------------------- identidade ------------------------------- */

export type PortalIdentity = { value: string; save: (v: string) => void };

const PortalIdentityContext = createContext<PortalIdentity>({ value: "", save: () => {} });

export const PortalIdentityProvider = PortalIdentityContext.Provider;

export function usePortalIdentity() {
  return useContext(PortalIdentityContext);
}

/* --------------------------------- UI base -------------------------------- */

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function TokenError({ message }: { message?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-xl border border-border/60 bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">Link indisponível</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {message === "token_expired"
            ? "Este link expirou."
            : message === "token_revoked"
              ? "Este link foi revogado."
              : "Este link não é válido. Peça um novo para sua equipe."}
        </p>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Home;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-card px-6 py-16 text-center">
      <Icon className="h-6 w-6 text-muted-foreground" />
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </div>
  );
}

export function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="aspect-[4/5] w-full" />
      ))}
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

/* -------------------------------- formatters ------------------------------ */

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
export function formatMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
export function shiftYm(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function buildMonthGrid(ym: string): Array<Date | null> {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const cells: Array<Date | null> = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(y, m - 1, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
export function formatBytes(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
