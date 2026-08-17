import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpandedModal } from "@/components/ui/expanded-modal";
import { cn } from "@/lib/utils";
import { describeError } from "@/lib/errors";
import {
  PUBLICATION_STATUS,
  DESTINATION_STATUS_LABEL,
  formatLabel,
} from "@/lib/publication-status-tokens";
import { SOCIAL_NETWORKS, classifySocialNetwork } from "@/lib/calendar-tokens";
import type { PublicationItem } from "@/lib/calendar-board.functions";
import { retryFailedPlacementFn } from "@/lib/publish-retry.functions";
import { cancelPostScheduleFn } from "@/lib/scheduling-wizard.functions";

/**
 * Detalhe da publicação. Reaproveita as ações já existentes do pipeline:
 * cancelamento de agendamento (`cancelPostScheduleFn`) e republicação POR
 * DESTINO (`retryFailedPlacementFn`) — nunca reenvia destino já publicado.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function dt(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString("pt-BR") : "—";
}

export function PublicationDetailModal({
  item,
  open,
  onOpenChange,
  onEdit,
  onChanged,
}: {
  item: PublicationItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit: (item: PublicationItem) => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const retry = useServerFn(retryFailedPlacementFn);
  const cancel = useServerFn(cancelPostScheduleFn);
  const [busy, setBusy] = useState<string | null>(null);

  if (!item) return null;
  const token = PUBLICATION_STATUS[item.overall];
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const canCancel =
    (item.overall === "scheduled" || item.overall === "failed") &&
    item.destinations.some((d) => d.status !== "published");
  const canEdit = item.overall !== "published";

  async function handleRetry(placementId: string, label: string) {
    if (busy) return;
    setBusy(placementId);
    try {
      await retry({ data: { postId: item!.postId, brandId: item!.brandId, placementId } });
      toast.success(`${label} recolocado na fila de publicação.`);
      await qc.invalidateQueries({ queryKey: ["publication-board"] });
      onChanged();
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel() {
    if (busy) return;
    setBusy("cancel");
    try {
      await cancel({ data: { postId: item!.postId, brandId: item!.brandId } });
      toast.success("Agendamento cancelado. A peça voltou para edição.");
      await qc.invalidateQueries({ queryKey: ["publication-board"] });
      onChanged();
      onOpenChange(false);
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ExpandedModal
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={item.title}
      description={
        item.overall === "partial"
          ? `Publicação parcial — ${item.publishedCount} de ${item.totalDestinations} destinos publicados`
          : token.label
      }
      headerExtra={
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
            token.chip,
          )}
        >
          {item.overall === "partial"
            ? `Parcial ${item.publishedCount}/${item.totalDestinations}`
            : token.label}
        </span>
      }
      footer={
        <>
          {canCancel ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={busy === "cancel"}
            >
              {busy === "cancel" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Cancelar agendamento
            </Button>
          ) : null}
          {canEdit ? (
            <Button size="sm" onClick={() => onEdit(item)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              {item.overall === "draft"
                ? "Continuar edição"
                : item.overall === "scheduled"
                  ? "Editar / reagendar"
                  : "Editar"}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-5">
        <Section title="Conteúdo">
          <div className="flex gap-3">
            {item.coverUrl ? (
              <img
                src={item.coverUrl}
                alt=""
                className="h-24 w-24 shrink-0 rounded-md border border-border/60 object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md border border-dashed border-border/70 text-[10px] text-muted-foreground">
                Sem mídia
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-tight">{item.title}</div>
              <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {item.copy?.trim() ? item.copy : "Sem legenda."}
              </p>
            </div>
          </div>
        </Section>

        <Section title="Agenda">
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Data</dt>
              <dd className="mt-0.5 font-medium">
                {item.when
                  ? new Date(item.when).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                  : "—"}
              </dd>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Hora</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {item.when
                  ? new Date(item.when).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </dd>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Timezone
              </dt>
              <dd className="mt-0.5 truncate font-medium">{tz}</dd>
            </div>
          </dl>
        </Section>

        <Section title={`Destinos (${item.destinations.length})`}>
          {item.destinations.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/70 px-3 py-3 text-xs text-muted-foreground">
              Nenhum destino configurado. Abra a edição para escolher as contas.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {item.destinations.map((d) => {
                const net = SOCIAL_NETWORKS[classifySocialNetwork(d.channel)];
                const Icon = net.Icon;
                return (
                  <li
                    key={d.placementId ?? `${d.channel}-${d.format}`}
                    className={cn(
                      "rounded-md border px-2.5 py-2",
                      d.status === "failed"
                        ? "border-destructive/40 bg-destructive/5"
                        : "border-border/60 bg-background",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {d.status === "published" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        ) : d.status === "failed" ? (
                          <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                        ) : d.status === "publishing" ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-500" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate text-xs font-medium">
                          {net.label} · {formatLabel(d.format)}
                        </span>
                        {d.accountLabel ? (
                          <span className="truncate text-[11px] text-muted-foreground">
                            @{d.accountLabel}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {DESTINATION_STATUS_LABEL[d.status] ?? d.status}
                        </span>
                        {d.permalink ? (
                          <a
                            href={d.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            Ver <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                        {d.canRetry && d.placementId ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            disabled={!!busy}
                            onClick={() => handleRetry(d.placementId!, net.label)}
                          >
                            {busy === d.placementId ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-1 h-3 w-3" />
                            )}
                            Tentar novamente
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {d.status === "failed" && d.error ? (
                      <p className="mt-1 pl-5 text-[11px] leading-snug text-destructive">
                        {d.error}
                        {d.attempts ? ` (${d.attempts} tentativa${d.attempts > 1 ? "s" : ""})` : ""}
                      </p>
                    ) : null}
                    {d.status === "published" && d.publishedAt ? (
                      <p className="mt-1 pl-5 text-[11px] text-muted-foreground">
                        Publicado em {dt(d.publishedAt)}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {item.overall === "partial" ? (
          <div className="flex items-start gap-2 rounded-md border border-orange-500/40 bg-orange-500/5 px-3 py-2 text-[11px] text-orange-700 dark:text-orange-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Publicação parcial: {item.publishedCount} de {item.totalDestinations} destinos
              publicaram. A ação de republicar atua somente no destino com falha.
            </span>
          </div>
        ) : null}

        <Section title="Histórico">
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            <li>Criado em {dt(item.createdAt)}</li>
            {item.scheduledAt ? <li>Agendado para {dt(item.scheduledAt)}</li> : null}
            {item.destinations
              .filter((d) => d.publishedAt)
              .map((d) => (
                <li key={`h-${d.placementId}`}>
                  {SOCIAL_NETWORKS[classifySocialNetwork(d.channel)].label} publicado em{" "}
                  {dt(d.publishedAt)}
                </li>
              ))}
            {item.destinations
              .filter((d) => d.status === "failed")
              .map((d) => (
                <li key={`hf-${d.placementId}`} className="text-destructive">
                  {SOCIAL_NETWORKS[classifySocialNetwork(d.channel)].label} falhou —{" "}
                  {d.error ?? "erro não informado"}
                </li>
              ))}
            <li>Última atualização em {dt(item.updatedAt)}</li>
          </ul>
        </Section>
      </div>
    </ExpandedModal>
  );
}
