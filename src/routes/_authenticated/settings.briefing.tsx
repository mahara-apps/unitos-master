import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  listBriefingTokens,
  createBriefingToken,
  revokeBriefingToken,
  type BriefingTokenRow,
} from "@/lib/briefing-tokens.functions";
import { listClients } from "@/lib/workspace.functions";
import { useActiveContext } from "@/hooks/use-active-context";
import { usePageHeader } from "@/hooks/use-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Copy, Link2, ShieldOff, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/briefing")({
  component: BriefingSettingsPage,
});

type Row = BriefingTokenRow & { client_name: string };

function statusOf(t: Row): { label: string; className: string } {
  if (t.revoked_at) return { label: "Revoked", className: "bg-rose-500/10 text-rose-300 border-rose-500/30" };
  if (t.submitted_at) return { label: "Submitted", className: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" };
  if (t.expires_at && new Date(t.expires_at).getTime() < Date.now())
    return { label: "Expired", className: "bg-amber-500/10 text-amber-300 border-amber-500/30" };
  return { label: "Active", className: "bg-sky-500/10 text-sky-300 border-sky-500/30" };
}

function BriefingSettingsPage() {
  const { brandId } = useActiveContext();
  const qc = useQueryClient();
  const load = useServerFn(listBriefingTokens);
  const loadClients = useServerFn(listClients);
  const createFn = useServerFn(createBriefingToken);
  const revokeFn = useServerFn(revokeBriefingToken);

  const { data: tokens, isLoading } = useQuery({
    queryKey: ["briefing-tokens", brandId],
    queryFn: () => load({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });
  const { data: clients } = useQuery({
    queryKey: ["brand-clients", brandId],
    queryFn: () => loadClients({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  usePageHeader({ title: "Briefing links", subtitle: "Share a public form with your customers to collect their brand parameters." });

  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState<string>("");
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          brandId: brandId!,
          clientId,
          label: label || undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["briefing-tokens", brandId] });
      setOpen(false);
      setClientId("");
      setLabel("");
      setExpiresAt("");
      toast.success("Briefing link created");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to create link"),
  });

  const revoke = useMutation({
    mutationFn: (tokenId: string) => revokeFn({ data: { brandId: brandId!, tokenId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["briefing-tokens", brandId] });
      toast.success("Access revoked");
    },
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const rows = useMemo(() => tokens ?? [], [tokens]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Public briefing invitations</h2>
          <p className="text-sm text-muted-foreground">
            Each link opens a public form. Data is written directly into the customer's Brand Intelligence Hub.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New link</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create briefing link</DialogTitle>
              <DialogDescription>Pick a customer and (optionally) an expiration date.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger>
                  <SelectContent>
                    {(clients ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Label (optional)</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Kickoff briefing" />
              </div>
              <div className="space-y-1.5">
                <Label>Expires (optional)</Label>
                <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={!clientId || create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? "Creating…" : "Create link"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/40 backdrop-blur">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_auto] gap-4 border-b border-border/60 px-4 py-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
          <div>Customer / label</div>
          <div>Status</div>
          <div>Expires</div>
          <div>Created</div>
          <div />
        </div>
        {isLoading && <div className="px-4 py-8 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && rows.length === 0 && (
          <div className="px-4 py-8 text-sm text-muted-foreground">No links yet. Create one to invite a customer.</div>
        )}
        {rows.map((t) => {
          const st = statusOf(t);
          const url = `${origin}/p/briefing/${t.token}`;
          const canRevoke = !t.revoked_at && !t.submitted_at;
          return (
            <div
              key={t.id}
              className="grid grid-cols-[1.5fr_1fr_1fr_1fr_auto] items-center gap-4 border-b border-border/40 px-4 py-3 text-sm last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{t.client_name}</div>
                <div className="truncate text-xs text-muted-foreground">{t.label || "—"}</div>
              </div>
              <div>
                <Badge variant="outline" className={st.className}>{st.label}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {t.expires_at ? format(new Date(t.expires_at), "PP HH:mm") : "Never"}
              </div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(t.created_at), "PP")}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  title="Copy link"
                  onClick={() => {
                    navigator.clipboard.writeText(url);
                    toast.success("Link copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" asChild title="Open link">
                  <a href={url} target="_blank" rel="noreferrer"><Link2 className="h-4 w-4" /></a>
                </Button>
                {canRevoke && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Revoke access"
                    onClick={() => {
                      if (confirm("Revoke this briefing link? The customer will no longer be able to submit.")) {
                        revoke.mutate(t.id);
                      }
                    }}
                    className="text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                  >
                    <ShieldOff className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}