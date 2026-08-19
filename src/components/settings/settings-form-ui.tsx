// Primitivas visuais das telas de Configurações → Minha conta.
// Linguagem: superfícies discretas, separadores sutis, zero cards aninhados.
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Bloco de configuração: título/descrição à esquerda, campos à direita no desktop. */
export function SettingsBlock({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "grid gap-4 border-t border-border/50 py-6 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-10",
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description ? (
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function SettingsFieldGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2", className)}>
      {children}
    </div>
  );
}

export function SettingsField({
  label,
  htmlFor,
  hint,
  full,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", full && "sm:col-span-2")}>
      <Label htmlFor={htmlFor} className="text-[12px] font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Linha de configuração com ação à direita — substitui cards de atalho. */
export function SettingsRow({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-3 rounded-xl bg-muted/40 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span> : null}
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight">{title}</p>
          {description ? (
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0 sm:justify-self-end">{action}</div> : null}
    </div>
  );
}

/** Metadados compactos da conta (função, fuso, idioma, WhatsApp…). */
export function SettingsMetaList({ children }: { children: ReactNode }) {
  return <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">{children}</dl>;
}

export function SettingsMetaItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}
