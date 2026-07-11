import * as React from "react";
import { Sparkles, CalendarClock, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { AgencyDashboard } from "@/lib/dashboard.functions";

function SiriOrb() {
  return (
    <div
      className="relative mx-auto h-32 w-32 select-none"
      style={{ animation: "orb-breathe 4s ease-in-out infinite" }}
      aria-hidden
    >
      {/* Ambient outer halo */}
      <div
        className="absolute inset-[-18%] rounded-full opacity-70 blur-2xl"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(139,92,246,0.55), rgba(236,72,153,0.25) 55%, transparent 75%)",
        }}
      />

      {/* Blending color layers */}
      <div
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{ mixBlendMode: "screen", filter: "blur(14px)" }}
      >
        <div
          className="absolute inset-[-10%] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 30% 35%, rgba(236,72,153,0.95), transparent 60%)",
            animation: "orb-drift-a 7s ease-in-out infinite",
          }}
        />
        <div
          className="absolute inset-[-10%] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 70% 40%, rgba(34,211,238,0.9), transparent 60%)",
            animation: "orb-drift-b 9s ease-in-out infinite",
          }}
        />
        <div
          className="absolute inset-[-10%] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 55% 70%, rgba(139,92,246,0.95), transparent 62%)",
            animation: "orb-drift-c 11s ease-in-out infinite",
          }}
        />
        <div
          className="absolute inset-[-10%] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 40% 60%, rgba(99,102,241,0.85), transparent 60%)",
            animation: "orb-drift-d 13s ease-in-out infinite",
          }}
        />
        <div
          className="absolute inset-[-10%] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 65% 30%, rgba(244,114,182,0.7), transparent 60%)",
            animation: "orb-drift-a 15s ease-in-out infinite reverse",
          }}
        />
      </div>

      {/* Glass rim */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          boxShadow:
            "inset 0 0 24px rgba(255,255,255,0.18), inset 0 0 1px rgba(255,255,255,0.6)",
        }}
      />

      {/* Bright inner core */}
      <div
        className="absolute left-1/2 top-1/2 h-4 w-6 rounded-full bg-white/90 blur-md"
        style={{ animation: "orb-core-pulse 3.2s ease-in-out infinite" }}
      />
    </div>
  );
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function isSameLocalDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

type Props = {
  brandId: string;
  data?: AgencyDashboard;
};

export function WelcomeModal({ brandId, data }: Props) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState<string | null>(null);
  const [userId, setUserId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: u }) => {
      if (cancelled || !u.user) return;
      const meta = (u.user.user_metadata ?? {}) as Record<string, unknown>;
      const full =
        (meta.full_name as string) ||
        (meta.name as string) ||
        (u.user.email ? u.user.email.split("@")[0] : null);
      setUserId(u.user.id);
      setName(full);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!userId || !brandId) return;
    const today = new Date().toISOString().slice(0, 10);
    const key = `nf-welcome:${userId}:${brandId}:${today}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [userId, brandId]);

  const now = new Date();
  const greeting = greetingFor(now);
  const firstName = (name ?? "").trim().split(/\s+/)[0] || null;

  const releasesToday =
    data?.upcoming?.filter((u) => u.kind === "post" && isSameLocalDay(u.when, now)).length ?? 0;
  const approvalsPending = data?.counts?.approvals_pending ?? 0;
  const readyClient =
    data?.healths?.find((h) => h.score >= 85)?.name ??
    data?.healths?.[0]?.name ??
    null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="border-white/20 bg-white/40 backdrop-blur-xl dark:border-white/10 dark:bg-black/40 sm:max-w-lg"
        style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 30px 80px -20px rgba(0,0,0,0.5)" }}
      >
        <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        <div className="pt-2">
          <SiriOrb />
        </div>
        <DialogHeader className="space-y-2">
          <div className="flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            NexusFlow Intelligence
          </div>
          <DialogTitle className="text-center text-2xl font-semibold tracking-tight">
            {greeting}
            {firstName ? `, ${firstName}` : ""}.
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-muted-foreground">
            Here is a quick read of your day across the agency.
          </DialogDescription>
        </DialogHeader>

        <ul className="mt-2 space-y-3">
          <SummaryRow
            icon={<CalendarClock className="h-3.5 w-3.5" />}
            text={
              releasesToday > 0
                ? `${releasesToday} content release${releasesToday === 1 ? "" : "s"} scheduled for today.`
                : "No content releases scheduled for today — a good window to move things forward."
            }
          />
          <SummaryRow
            icon={<AlertCircle className="h-3.5 w-3.5" />}
            text={
              approvalsPending > 0
                ? `${approvalsPending} approval${approvalsPending === 1 ? "" : "s"} still pending client feedback.`
                : "All approvals cleared — the pipeline is flowing."
            }
          />
          <SummaryRow
            icon={<Sparkles className="h-3.5 w-3.5" />}
            text={
              readyClient
                ? `${readyClient}'s strategy is ready to be initiated.`
                : "Bring a customer on board to unlock strategic pipelines."
            }
          />
        </ul>

        <DialogFooter className="mt-4">
          <Button
            onClick={() => setOpen(false)}
            className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            Let&apos;s work
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 text-sm text-foreground/90 backdrop-blur">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-border/50 bg-background/60 text-foreground/70">
        {icon}
      </span>
      <span className="leading-relaxed">{text}</span>
    </li>
  );
}