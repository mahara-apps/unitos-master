// Primitiva de seção do Painel do Cliente.
// Um único desenho de card/seção para todas as abas: título curto, descrição
// opcional em linguagem de cliente, ação principal à direita e corpo com ou
// sem padding (listas encostam nas bordas). Substitui variações locais.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PanelSection({
  title,
  description,
  icon,
  action,
  footer,
  padded = true,
  className,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  /** false → o corpo encosta nas bordas (listas divididas). */
  padded?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm",
        className,
      )}
    >
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        <div className="flex min-w-0 items-start gap-2.5">
          {icon ? (
            <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </header>
      <div className={cn(padded ? "px-4 pb-4 sm:px-5 sm:pb-5" : "pb-1")}>{children}</div>
      {footer ? (
        <footer className="border-t border-border/40 px-4 py-3 sm:px-5">{footer}</footer>
      ) : null}
    </section>
  );
}

/** Agrupador de blocos relacionados (ex.: "Dados da empresa" na aba Conta). */
export function PanelGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="min-w-0">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground/80">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
