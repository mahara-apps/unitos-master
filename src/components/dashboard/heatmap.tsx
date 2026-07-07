import { cn } from "@/lib/utils";

/** Heatmap 7xN a partir de um array linear de N*7 dias, index 0 = dia mais antigo. */
export function PublicationHeatmap({ data, className }: { data: number[]; className?: string }) {
  const max = Math.max(1, ...data);
  // organize em semanas x dias (7 rows)
  const cells = data;
  const weeks = Math.ceil(cells.length / 7);
  const grid: number[][] = Array.from({ length: 7 }, () => Array(weeks).fill(0));
  cells.forEach((v, i) => {
    const week = Math.floor(i / 7);
    const dow = i % 7;
    grid[dow][week] = v;
  });
  const labels = ["S", "T", "Q", "Q", "S", "S", "D"];
  return (
    <div className={cn("flex gap-1.5", className)}>
      <div className="flex flex-col gap-0.5 pr-1 text-[10px] text-muted-foreground">
        {labels.map((l, i) => (
          <span key={i} className="h-3 leading-3">{l}</span>
        ))}
      </div>
      <div className="flex gap-0.5 overflow-hidden">
        {Array.from({ length: weeks }, (_, w) => (
          <div key={w} className="flex flex-col gap-0.5">
            {Array.from({ length: 7 }, (_, d) => {
              const v = grid[d][w] ?? 0;
              const intensity = v === 0 ? 0.08 : 0.2 + (v / max) * 0.8;
              return (
                <div
                  key={d}
                  className="h-3 w-3 rounded-[3px]"
                  style={{ background: `color-mix(in oklch, var(--color-primary) ${(intensity * 100).toFixed(0)}%, transparent)` }}
                  title={`${v} publicação(ões)`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}