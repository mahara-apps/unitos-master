import { Sparkles } from "lucide-react";

export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl border border-border/60 bg-card">
        <Sparkles className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <span className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        Em breve
      </span>
    </div>
  );
}