import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { useActiveContext } from "@/hooks/use-active-context";
import { useAccessRole } from "@/hooks/use-access-role";
import { listClients } from "@/lib/workspace.functions";
import { resetScopeCache } from "@/lib/session-reset";
import { visibleClientsFor } from "@/lib/client-chooser-rules";
import { CustomerAvatar } from "@/components/customer/customer-avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ClientRow = { id: string; name: string | null; logo_url?: string | null };

/** Lista só os clientes que a pessoa pode acessar e ativa o escolhido. */
function useChooser() {
  const { brandId, clientId, setClientId } = useActiveContext();
  const { allowedClientIds } = useAccessRole();
  const qc = useQueryClient();
  const listCl = useServerFn(listClients);
  const q = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => listCl({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });
  const clients = visibleClientsFor((q.data ?? []) as ClientRow[], allowedClientIds ?? null);
  const choose = (id: string) => {
    setClientId(id);
    resetScopeCache(qc, [id, clientId, brandId]);
  };
  return { clients, loading: q.isLoading, choose };
}

function ClientList({ onPick }: { onPick: (id: string) => void }) {
  const { clients, loading, choose } = useChooser();
  const [term, setTerm] = useState("");
  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return t ? clients.filter((c) => (c.name ?? "").toLowerCase().includes(t)) : clients;
  }, [clients, term]);
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  }
  if (clients.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Você ainda não tem clientes atribuídos.</p>;
  }
  return (
    <div className="space-y-2">
      {clients.length > 6 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar cliente" className="h-9 pl-8 text-sm" />
        </div>
      ) : null}
      <div className="max-h-[50vh] space-y-1 overflow-y-auto">
        {filtered.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              choose(c.id);
              onPick(c.id);
            }}
            className="flex w-full items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-left text-sm hover:bg-muted"
          >
            <CustomerAvatar name={c.name ?? "Cliente"} logoUrl={c.logo_url ?? null} className="h-7 w-7" />
            <span className="truncate font-medium">{c.name?.trim() || "Cliente sem nome"}</span>
          </button>
        ))}
        {filtered.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">Nenhum cliente encontrado.</p> : null}
      </div>
    </div>
  );
}

/** Janela "Para qual cliente?" usada quando a pessoa está em "Todos os clientes". */
export function ClientChooserDialog({
  open,
  onOpenChange,
  title = "Para qual cliente?",
  description,
  onPicked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onPicked?: (clientId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <ClientList
          onPick={(id) => {
            onOpenChange(false);
            onPicked?.(id);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Mesma escolha, embutida na página (sem janela). */
export function ClientChooserPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto mt-10 w-full max-w-md rounded-lg border border-border/60 bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">{description}</p>
      <ClientList onPick={() => undefined} />
    </div>
  );
}
