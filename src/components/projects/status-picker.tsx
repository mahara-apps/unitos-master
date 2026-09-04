/**
 * Seletor de status cadastrável (work_statuses) por escopo.
 * Sem status cadastrados, cai no conjunto legado do próprio registro,
 * garantindo que nada quebre em workspaces que ainda não configuraram.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listWorkStatusesFn,
  type WorkStatus,
  type WorkStatusScope,
} from "@/lib/work-statuses.functions";

const NONE = "__none__";

export function useWorkStatuses(brandId: string, scope: WorkStatusScope) {
  const list = useServerFn(listWorkStatusesFn);
  return useQuery({
    queryKey: ["work-statuses", brandId, scope],
    enabled: !!brandId,
    staleTime: 60_000,
    queryFn: () => list({ data: { brandId, scope } }),
  });
}

export function StatusDot({ color }: { color: string | null }) {
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color ?? "hsl(var(--muted-foreground))" }}
    />
  );
}

export function StatusPicker({
  brandId,
  scope,
  value,
  onChange,
  disabled,
  className = "h-8 w-[170px]",
}: {
  brandId: string;
  scope: WorkStatusScope;
  value: string | null;
  onChange: (statusId: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const statusesQ = useWorkStatuses(brandId, scope);
  const statuses = (statusesQ.data ?? []) as WorkStatus[];

  if (statuses.length === 0) return null;

  return (
    <Select
      value={value ?? NONE}
      disabled={disabled}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
    >
      <SelectTrigger className={className} aria-label="Status">
        <SelectValue placeholder="Sem status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Sem status</SelectItem>
        {statuses.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <span className="flex items-center gap-2">
              <StatusDot color={s.color} />
              <span className="truncate">{s.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Rótulo somente-leitura de um status cadastrado. */
export function StatusBadge({
  statusId,
  statuses,
}: {
  statusId: string | null;
  statuses: WorkStatus[];
}) {
  if (!statusId) return null;
  const s = statuses.find((x) => x.id === statusId);
  if (!s) return null;
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2 py-0.5 text-[11px]">
      <StatusDot color={s.color} />
      {s.name}
    </span>
  );
}
