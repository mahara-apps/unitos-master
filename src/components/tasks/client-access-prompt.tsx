import { useEffect, useRef, useState } from "react";
import { useQueryClient, type Mutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
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
import { isNoClientAccessMessage, parseNoClientAccess, type NoClientAccess } from "@/lib/client-access-error";
import { clientAccessInfoFn, grantClientAccessFn, requestClientAccessFn } from "@/lib/client-access.functions";

type Pending = NoClientAccess & {
  canGrant: boolean;
  clientName: string;
  personName: string;
  retry: (() => Promise<unknown>) | null;
};

/**
 * Quando uma atribuição falha porque a pessoa não acessa o cliente, oferece
 * liberar o acesso (se a hierarquia permitir) ou pedir aos responsáveis.
 * Escuta todas as mutações; a regra de quem pode liberar fica no banco.
 */
export function ClientAccessPrompt() {
  const qc = useQueryClient();
  const info = useServerFn(clientAccessInfoFn);
  const grant = useServerFn(grantClientAccessFn);
  const request = useServerFn(requestClientAccessFn);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const openRef = useRef(false);

  useEffect(() => {
    const original = toast.error;
    // O diálogo substitui o aviso de erro genérico.
    (toast as { error: typeof toast.error }).error = ((msg, opts) =>
      isNoClientAccessMessage(msg) ? "" : original(msg, opts)) as typeof toast.error;
    const unsub = qc.getMutationCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "error") return;
      const parsed = parseNoClientAccess(event.action.error);
      if (!parsed || openRef.current) return;
      openRef.current = true;
      const m = event.mutation as Mutation<unknown, unknown, unknown, unknown>;
      const fn = m.options.mutationFn;
      const vars = m.state.variables;
      const retry = fn ? () => fn(vars, undefined as never) : null;
      void info({ data: parsed })
        .then((r) => setPending({ ...parsed, ...r, retry }))
        .catch(() => {
          openRef.current = false;
          original("Este responsável não tem acesso ao cliente da tarefa.");
        });
    });
    return () => {
      unsub();
      (toast as { error: typeof toast.error }).error = original;
    };
  }, [qc, info]);

  const close = () => {
    openRef.current = false;
    setPending(null);
  };

  const onConfirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const payload = { clientId: pending.clientId, userId: pending.userId, taskId: pending.taskId };
      if (pending.canGrant) {
        await grant({ data: payload });
        if (pending.retry) await pending.retry();
        toast.success(`${pending.personName} agora acessa ${pending.clientName} e foi atribuído(a).`);
      } else {
        await request({ data: payload });
        toast.success("Pedido enviado. Quando for aprovado, a pessoa vira responsável automaticamente.");
      }
      await qc.invalidateQueries();
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={!!pending} onOpenChange={(o) => !o && !busy && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.personName} não acessa {pending?.clientName}</AlertDialogTitle>
          <AlertDialogDescription>
            {pending?.canGrant
              ? `Liberar o acesso de ${pending.personName} ao cliente ${pending.clientName} e atribuir? O papel e as permissões da pessoa não mudam: ela só passa a ver este cliente.`
              : `Você não pode liberar este acesso. Podemos pedir a um Owner, Admin ou Manager do cliente; ao aprovar, ${pending?.personName ?? "a pessoa"} vira responsável automaticamente.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
          >
            {busy ? "Aguarde…" : pending?.canGrant ? "Liberar e atribuir" : "Pedir acesso"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
