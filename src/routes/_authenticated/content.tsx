import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, Instagram, Linkedin, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/content")({
  component: ContentPage,
});

type Stage = "briefing" | "writing" | "design" | "review" | "approved" | "scheduled";

const stages: { id: Stage; label: string; hint: string }[] = [
  { id: "briefing", label: "Briefing", hint: "Context & references" },
  { id: "writing", label: "AI Copy", hint: "Writer + Strategist" },
  { id: "design", label: "Design", hint: "Art + generated image" },
  { id: "review", label: "Review", hint: "Compliance & QA" },
  { id: "approved", label: "Approved", hint: "Ready to publish" },
  { id: "scheduled", label: "Scheduled", hint: "Publish queue" },
];

type Post = {
  id: string;
  title: string;
  client: string;
  color: string;
  stage: Stage;
  channel: "instagram" | "linkedin" | "tiktok";
  due: string;
  assignee: string;
  aiScore: number;
};

const posts: Post[] = [
  { id: "p1", title: "Fall collection launch — carousel", client: "Nova Studio", color: "#f97316", stage: "briefing", channel: "instagram", due: "07/12", assignee: "AM", aiScore: 0 },
  { id: "p2", title: "Client case: 3.4x ROI in 90 days", client: "Ativa B2B", color: "#3b82f6", stage: "writing", channel: "linkedin", due: "07/10", assignee: "LR", aiScore: 62 },
  { id: "p3", title: "Reels: 3 funnel mistakes", client: "Ativa B2B", color: "#3b82f6", stage: "writing", channel: "tiktok", due: "07/11", assignee: "AI", aiScore: 78 },
  { id: "p4", title: "Educational post — LGPD for clinics", client: "Vitta Saúde", color: "#10b981", stage: "design", channel: "instagram", due: "07/13", assignee: "DP", aiScore: 84 },
  { id: "p5", title: "Senior role announcement", client: "Nova Studio", color: "#f97316", stage: "review", channel: "linkedin", due: "07/09", assignee: "AM", aiScore: 91 },
  { id: "p6", title: "Client testimonial — captioned video", client: "Vitta Saúde", color: "#10b981", stage: "approved", channel: "instagram", due: "07/08", assignee: "DP", aiScore: 96 },
  { id: "p7", title: "'Behind the scenes' series — ep. 04", client: "Nova Studio", color: "#f97316", stage: "scheduled", channel: "instagram", due: "07/07", assignee: "AM", aiScore: 98 },
];

const channelIcon = {
  instagram: Instagram,
  linkedin: Linkedin,
  tiktok: MessageCircle,
};

function ContentPage() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">Content pipeline</h1>
          <p className="text-xs text-muted-foreground">Weekly flow · 7 posts in progress · 2 urgent</p>
        </div>
        <Button size="sm" className="gap-2">
          <Sparkles className="h-3.5 w-3.5" /> New AI post
        </Button>
      </div>
      <div className="flex flex-1 gap-3 overflow-x-auto p-4">
        {stages.map((s) => {
          const items = posts.filter((p) => p.stage === s.id);
          return (
            <div key={s.id} className="flex w-72 shrink-0 flex-col rounded-lg border border-border/60 bg-card/40">
              <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                <div>
                  <div className="text-xs font-medium">{s.label}</div>
                  <div className="text-[10px] text-muted-foreground">{s.hint}</div>
                </div>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{items.length}</Badge>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {items.map((p) => {
                  const Icon = channelIcon[p.channel];
                  return (
                    <div key={p.id} className="group cursor-pointer rounded-md border border-border/60 bg-background/60 p-3 transition hover:border-primary/40 hover:bg-background">
                      <div className="mb-2 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.client}</span>
                      </div>
                      <div className="mb-3 text-xs font-medium leading-snug">{p.title}</div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3 w-3" />
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{p.due}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {p.aiScore > 0 && (
                            <span className="flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 font-mono text-primary">
                              <Sparkles className="h-2.5 w-2.5" />{p.aiScore}
                            </span>
                          )}
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[9px]">{p.assignee}</AvatarFallback>
                          </Avatar>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}