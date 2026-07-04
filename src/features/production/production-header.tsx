import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Campaign } from "./types";

interface Props {
  campaigns: Campaign[];
  campaignId: string;
  onCampaignChange: (id: string) => void;
  onNewPost: () => void;
}

export function ProductionHeader({ campaigns, campaignId, onCampaignChange, onNewPost }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight text-foreground">NexusFlow</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Produção
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <span className="text-xs text-muted-foreground">Campanha</span>
            <Select value={campaignId} onValueChange={onCampaignChange}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={onNewPost}>
          <Plus /> Novo Post
        </Button>
      </div>
    </header>
  );
}