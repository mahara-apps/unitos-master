import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  grantClientAccessFn,
  listClientAccessRequestsFn,
  listClientPeopleFn,
  resolveClientAccessRequestFn,
} from "@/lib/client-access.functions";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", manager: "Manager" };

/** "Pessoas com acesso" do cliente: liberar sem sair da tela e decidir pedidos. */
export function ClientPeopleAccess({ brandId, clientId }: { brandId: string; clientId: string }) {
  const qc = useQueryClient();
  const listPeople = useServerFn(listClientPeopleFn);
  const listReq = useServerFn(listClientAccessRequestsFn);
  const grant = useServerFn(grantClientAccessFn);
  const resolve = useServerFn(resolveClientAccessRequestFn);
  const [pick, setPick] = useState<string>("");
  const peopleKey = ["client-people-access", brandId, clientId];
  const reqKey = ["client-access-requests", clientId];
  const people = useQuery({ queryKey: peopleKey, queryFn: () => listPeople({ data: { brandId, clientId } }) });
  const requests = useQuery({ queryKey: reqKey, queryFn: () => listReq({ data: { clientId } }) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: peopleKey });
    void qc.invalidateQueries({ queryKey: reqKey });
  };
  const add = useMutation({
    mutationFn: (userId: string) => grant({ data: { clientId, userId } }),
    onSuccess: () => { setPick(""); refresh(); toast.success("Acesso liberado."); },
    onError: (e: Error) => toast.error(e.message),
  });
  const decide = useMutation({
    mutationFn: (v: { requestId: string; approve: boolean }) => resolve({ data: v }),
    onSuccess: (_r, v) => { refresh(); void qc.invalidateQueries(); toast.success(v.approve ? "Pedido aprovado." : "Pedido recusado."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const withAccess = (people.data ?? []).filter((p) => p.hasAccess);
  const grantable = (people.data ?? []).filter((p) => !p.hasAccess && p.canGrant);
  const pendingReq = requests.data ?? [];

  return (
    <section className="mb-6 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Pessoas com acesso</h3>
          <p className="text-xs text-muted-foreground">Liberar o cliente não muda o papel nem as permissões da pessoa.</p>
        </div>
        {grantable.length > 0 && (
          <div className="flex items-center gap-2">
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Adicionar pessoa…" /></SelectTrigger>
              <SelectContent>
                {grantable.map((p) => (
                  <SelectItem key={p.userId} value={p.userId}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!pick || add.isPending} onClick={() => add.mutate(pick)}>Liberar</Button>
          </div>
        )}
      </div>

      {pendingReq.length > 0 && (
        <ul className="mt-3 space-y-2">
          {pendingReq.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm">
              <span><strong>{r.requesterName}</strong> pediu acesso para <strong>{r.personName}</strong>{r.task_id ? " (para uma tarefa)" : ""}</span>
              {r.canDecide ? (
                <span className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ requestId: r.id, approve: false })}>Recusar</Button>
                  <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ requestId: r.id, approve: true })}>{r.task_id ? "Liberar e atribuir" : "Liberar"}</Button>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Aguardando aprovação</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {people.isLoading && <span className="text-xs text-muted-foreground">Carregando…</span>}
        {withAccess.map((p) => (
          <span key={p.userId} className="rounded-full border border-border px-2.5 py-0.5 text-xs">
            {p.name}{ROLE_LABEL[p.role] ? ` · ${ROLE_LABEL[p.role]}` : ""}
          </span>
        ))}
      </div>
    </section>
  );
}
