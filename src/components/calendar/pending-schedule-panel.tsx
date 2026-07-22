import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  FileText,
  Facebook,
  Instagram,
  Linkedin,
  Loader2,
  Music2,
  Pencil,
  Trash2,
  Youtube,
  Globe,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";
import { describeError } from "@/lib/errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DashboardPanelSurface,
  DashboardIconFrame,
} from "@/components/ui/dashboard-primitives";
import {
  deleteDraftPostFn,
  deleteApprovedPostFn,
  listApprovedUnscheduledFn,
  listDraftsFn,
  type PendingSchedulePost,
} from "@/lib/scheduling-wizard.functions";

const CHANNEL_ICONS: Record<string, typeof Instagram> = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  youtube: Youtube,
  tiktok: Music2,
};

const CHANNEL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
  threads: "Threads",
};

const FORMAT_LABELS: Record<string, string> = {
  feed: "Feed",
  stories: "Stories",
  reels: "Reels",
  carrossel: "Carrossel",
};

// Estilos por rede — usam tokens/utilitários do design system (sem hex hardcoded)
// para respeitar temas light/dark.
const CHANNEL_STYLES: Record<string, string> = {
  instagram:
    "border-transparent bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500 text-white",
  facebook: "border-transparent bg-blue-600 text-white",
  linkedin: "border-transparent bg-sky-700 text-white",
  youtube: "border-transparent bg-red-600 text-white",
  tiktok: "border-transparent bg-foreground text-background",
  x: "border-transparent bg-foreground text-background",
  threads: "border-transparent bg-foreground text-background",
};

const FORMAT_STYLES: Record<string, string> = {
  feed: "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300",
  stories: "border-transparent bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  reels: "border-transparent bg-violet-500/15 text-violet-700 dark:text-violet-300",
  carrossel: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

function ChannelChip({ channel }: { channel: string }) {
  const Icon = CHANNEL_ICONS[channel] ?? Globe;
  const label = CHANNEL_LABELS[channel] ?? channel;
  const cls = CHANNEL_STYLES[channel] ?? "border-transparent bg-muted text-foreground";
  return (
    <Badge
      className={`gap-1 px-1.5 py-0 text-[10px] font-medium ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export function PendingSchedulePanel({
  brandId,
  clientId,
  onPick,
  mode = "pending",
}: {
  brandId: string;
  clientId: string | null;
  onPick: (p: PendingSchedulePost) => void;
  mode?: "pending" | "drafts";
}) {
  const isDrafts = mode === "drafts";
  const listPending = useServerFn(listApprovedUnscheduledFn);
  const listDrafts = useServerFn(listDraftsFn);
  const deleteDraft = useServerFn(deleteDraftPostFn);
  const deleteApproved = useServerFn(deleteApprovedPostFn);
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<PendingSchedulePost | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (postId: string) =>
      isDrafts
        ? deleteDraft({ data: { postId, brandId } })
        : deleteApproved({ data: { postId, brandId } }),
    onSuccess: () => {
      toast.success(isDrafts ? "Rascunho excluído." : "Post excluído.");
      queryClient.invalidateQueries({
        queryKey: [isDrafts ? "wizard-drafts" : "pending-schedule", brandId, clientId],
      });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      setPendingDelete(null);
    },
    onError: (err) => toast.error(describeError(err)),
  });
  const q = useQuery({
    enabled: !!brandId,
    queryKey: [isDrafts ? "wizard-drafts" : "pending-schedule", brandId, clientId],
    queryFn: () =>
      isDrafts
        ? listDrafts({ data: { brandId, clientId: clientId ?? null } })
        : listPending({ data: { brandId, clientId: clientId ?? null } }),
  });
  const HeaderIcon = isDrafts ? FileText : CalendarClock;
  const headerTitle = isDrafts ? "Rascunhos" : "Aguardando agendamento";
  const headerSubtitle = isDrafts
    ? "Posts salvos para continuar depois"
    : "Posts aprovados sem data";
  const emptyLabel = isDrafts
    ? "Nenhum rascunho salvo."
    : "Nada esperando agendamento no momento.";
  const dateLabel = isDrafts ? "Atualizado" : "Aprovado";

  return (
    <DashboardPanelSurface>
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <DashboardIconFrame>
          <HeaderIcon className="h-4 w-4" />
        </DashboardIconFrame>
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight">
            {headerTitle}
          </div>
          <div className="text-xs text-muted-foreground">
            {headerSubtitle}
          </div>
        </div>
      </div>
      {q.isLoading ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : q.isError ? (
        <div className="px-4 py-6 text-center text-xs text-destructive">
          {describeError(q.error)}
        </div>
      ) : !q.data?.length ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <ScrollArea className="max-h-[440px]">
          <ul className="divide-y divide-border/60">
            {q.data.map((p) => {
              const channels = Array.from(
                new Set(
                  (p.placements.length
                    ? p.placements.map((pl) => pl.channel).filter(Boolean)
                    : p.channels) as string[],
                ),
              );
              const formats = Array.from(
                new Set(
                  p.placements
                    .map((pl) => pl.format)
                    .filter(Boolean) as string[],
                ),
              );
              const approved = p.approvedAt ? new Date(p.approvedAt) : null;
              return (
                <li key={p.postId} className="group relative">
                  <button
                    type="button"
                    onClick={() => onPick(p)}
                    className="flex w-full items-start gap-3 px-4 py-3 pr-12 text-left transition-colors hover:bg-muted/40"
                  >
                    {p.coverUrl ? (
                      <img
                        src={p.coverUrl}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-md border border-border/60 object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted text-[10px] text-muted-foreground">
                        sem mídia
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="truncate text-sm font-medium">
                        {p.title}
                      </div>
                      {p.copy ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {p.copy}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-1">
                        {channels.slice(0, 4).map((c) => (
                          <ChannelChip key={`c-${c}`} channel={c} />
                        ))}
                        {formats.slice(0, 4).map((f) => (
                          <Badge
                            key={`f-${f}`}
                            className={`px-1.5 py-0 text-[10px] font-medium ${
                              FORMAT_STYLES[f] ??
                              "border-transparent bg-muted text-foreground"
                            }`}
                          >
                            {FORMAT_LABELS[f] ?? f}
                          </Badge>
                        ))}
                      </div>
                      {approved ? (
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {dateLabel}{" "}
                          {format(approved, "d MMM · HH:mm", { locale: ptBR })}
                        </div>
                      ) : null}
                    </div>
                  </button>
                  <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Editar post"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPick(p);
                      }}
                      className="h-8 w-8"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={isDrafts ? "Excluir rascunho" : "Excluir post"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(p);
                      }}
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isDrafts ? "Excluir rascunho?" : "Excluir post aprovado?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isDrafts
                ? `O rascunho “${pendingDelete?.title}” será removido permanentemente. Esta ação não pode ser desfeita.`
                : `O post “${pendingDelete?.title}” será removido permanentemente e não poderá mais ser agendado. Esta ação não pode ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) deleteMutation.mutate(pendingDelete.postId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Excluindo…
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardPanelSurface>
  );
}
