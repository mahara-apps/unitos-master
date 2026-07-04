import { useState } from "react";
import { CheckCircle2, MessageSquareText, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Status = "pending" | "approved" | "rejected" | "changes_requested";

interface Props {
  status: Status;
  onApprove: () => Promise<void> | void;
  onReject: () => Promise<void> | void;
  onRequestChanges: (notes: string) => Promise<void> | void;
}

export function ActionBar({ status, onApprove, onReject, onRequestChanges }: Props) {
  const [changesOpen, setChangesOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "reject" | "changes">(null);

  async function handle(kind: "approve" | "reject" | "changes", fn: () => Promise<void> | void) {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  if (status !== "pending") {
    const map = {
      approved: {
        text: "Postagem aprovada",
        cls: "bg-emerald-600 text-white",
      },
      rejected: {
        text: "Postagem rejeitada",
        cls: "bg-red-600 text-white",
      },
      changes_requested: {
        text: "Ajustes solicitados — aguardando nova versão",
        cls: "bg-amber-500 text-white",
      },
    }[status];
    return (
      <div className={`mx-auto w-full max-w-xl rounded-xl px-4 py-3 text-center text-sm font-medium ${map.cls}`}>
        {map.text}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Button
          size="lg"
          className="h-12 bg-emerald-600 text-white shadow-md hover:bg-emerald-600/90 focus-visible:ring-emerald-500"
          onClick={() => handle("approve", () => onApprove())}
          disabled={busy !== null}
        >
          {busy === "approve" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
          Aprovar Postagem
        </Button>

        <Button
          size="lg"
          variant="secondary"
          className="h-12 bg-amber-500 text-white hover:bg-amber-500/90"
          onClick={() => setChangesOpen(true)}
          disabled={busy !== null}
        >
          <MessageSquareText />
          Solicitar Ajustes
        </Button>

        <Button
          size="lg"
          variant="outline"
          className="h-12 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/60"
          onClick={() => setRejectOpen(true)}
          disabled={busy !== null}
        >
          <XCircle />
          Rejeitar
        </Button>
      </div>

      {/* Solicitar ajustes */}
      <Dialog open={changesOpen} onOpenChange={setChangesOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Solicitar ajustes</DialogTitle>
            <DialogDescription>
              Descreva o que precisa ser alterado. Essa mensagem será enviada à agência.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={6}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex.: Trocar a chamada principal e reforçar o benefício de economia de tempo..."
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChangesOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-amber-500 text-white hover:bg-amber-500/90"
              disabled={notes.trim().length < 3 || busy !== null}
              onClick={async () => {
                await handle("changes", () => onRequestChanges(notes.trim()));
                setChangesOpen(false);
                setNotes("");
                toast.success("Ajustes enviados para a agência");
              }}
            >
              {busy === "changes" ? <Loader2 className="animate-spin" /> : null}
              Enviar ajustes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar rejeição */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeitar postagem?</DialogTitle>
            <DialogDescription>
              Esta ação sinaliza que o post não deve seguir para publicação. Você pode preferir
              apenas solicitar ajustes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-600/90"
              disabled={busy !== null}
              onClick={async () => {
                await handle("reject", () => onReject());
                setRejectOpen(false);
                toast.success("Postagem rejeitada");
              }}
            >
              {busy === "reject" ? <Loader2 className="animate-spin" /> : null}
              Confirmar rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}