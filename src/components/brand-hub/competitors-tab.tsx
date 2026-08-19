import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, RefreshCw, Trash2, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addCompetitor,
  removeCompetitor,
  scrapeCompetitor,
  type BrandHubCompetitor,
} from "@/lib/brand-hub.functions";

const PLATFORM_LABEL: Record<BrandHubCompetitor["platform"], string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
};

function fmtNumber(n?: number | null) {
  if (!n && n !== 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CompetitorsTab({
  brandId,
  clientId,
  competitors,
}: {
  brandId: string;
  clientId: string;
  competitors: BrandHubCompetitor[];
}) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["brand-hub", brandId, clientId] });

  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState<BrandHubCompetitor["platform"]>("instagram");
  const [notes, setNotes] = useState("");

  const addFn = useServerFn(addCompetitor);
  const removeFn = useServerFn(removeCompetitor);
  const scrapeFn = useServerFn(scrapeCompetitor);

  const addMut = useMutation({
    mutationFn: () =>
      addFn({ data: { brandId, clientId, handle, platform, notes: notes || undefined } }),
    onSuccess: () => {
      toast.success("Competitor added");
      setHandle("");
      setNotes("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Failed to add competitor"),
  });

  const removeMut = useMutation({
    mutationFn: (competitorId: string) => removeFn({ data: { brandId, clientId, competitorId } }),
    onSuccess: () => {
      toast.success("Competitor removed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scrapeMut = useMutation({
    mutationFn: (competitorId: string) => scrapeFn({ data: { brandId, clientId, competitorId } }),
    onSuccess: (res) => {
      if (res.ok) toast.success("Metrics refreshed");
      else toast.warning(res.competitor.last_error ?? "Scrape returned no data");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Competitor Benchmarking</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Register competitor social handles to enrich SWOT, market research, and copywriting
              prompts with real engagement patterns. Instagram scraping runs via Apify in the
              background.
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
            {competitors.length} / 30
          </Badge>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!handle.trim()) return;
            addMut.mutate();
          }}
          className="grid gap-3 sm:grid-cols-[1fr,180px,1.4fr,auto]"
        >
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Handle
            </Label>
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@competitorbrand"
              className="mt-1 bg-background font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Platform
            </Label>
            <Select
              value={platform}
              onValueChange={(v) => setPlatform(v as BrandHubCompetitor["platform"])}
            >
              <SelectTrigger className="mt-1 bg-background text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PLATFORM_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Notes (optional)
            </Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Direct competitor, aspirational, adjacent…"
              className="mt-1 bg-background text-xs"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={addMut.isPending || !handle.trim()} className="gap-2">
              {addMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card">
        {competitors.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
            <Users className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">No competitors registered yet</p>
            <p className="text-xs text-muted-foreground">
              Add at least 2-3 handles so the AI can benchmark voice, formats and engagement.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Handle</TableHead>
                <TableHead className="hidden sm:table-cell">Platform</TableHead>
                <TableHead className="text-right">Followers</TableHead>
                <TableHead className="text-right">Avg. likes</TableHead>
                <TableHead className="text-right">Engagement</TableHead>
                <TableHead className="hidden md:table-cell">Last sync</TableHead>
                <TableHead className="w-[110px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {competitors.map((c) => {
                const m = c.last_metrics;
                const er = m?.engagement_rate ? `${(m.engagement_rate * 100).toFixed(2)}%` : "—";
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-medium">@{c.handle}</span>
                        {c.notes ? (
                          <span className="text-[10px] text-muted-foreground">{c.notes}</span>
                        ) : null}
                        {c.last_error ? (
                          <span className="text-[10px] text-destructive">{c.last_error}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="text-[10px]">
                        {PLATFORM_LABEL[c.platform]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {fmtNumber(m?.followers)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {fmtNumber(m?.avg_likes)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{er}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {fmtDate(c.last_scraped_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => scrapeMut.mutate(c.id)}
                          disabled={scrapeMut.isPending}
                          title="Refresh metrics"
                        >
                          {scrapeMut.isPending && scrapeMut.variables === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeMut.mutate(c.id)}
                          disabled={removeMut.isPending}
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
