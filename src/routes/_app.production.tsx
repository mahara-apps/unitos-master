import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCampaigns, createPost } from "@/lib/api/posts";
import { KanbanBoard } from "@/features/production/kanban-board";
import { PostEditorSheet } from "@/features/production/post-editor-sheet";
import type { Post } from "@/features/production/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_app/production")({
  head: () => ({
    meta: [
      { title: "Produção — NexusFlow" },
      {
        name: "description",
        content:
          "Kanban de produção de conteúdo com IA integrada: rascunhe, revise e aprove posts em um único fluxo.",
      },
      { property: "og:title", content: "Produção — NexusFlow" },
      {
        property: "og:description",
        content: "Kanban de produção de conteúdo com IA integrada.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductionPage,
});

function ProductionPage() {
  const queryClient = useQueryClient();
  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns"],
    queryFn: fetchCampaigns,
  });

  const [campaignId, setCampaignId] = useState("c1");
  const [editing, setEditing] = useState<Post | null>(null);
  const [open, setOpen] = useState(false);

  const create = useMutation({
    mutationFn: createPost,
    onSuccess: (post) => {
      queryClient.invalidateQueries({ queryKey: ["posts", post.campaignId] });
      setEditing(post);
      setOpen(true);
    },
  });

  function handleOpenPost(p: Post) {
    setEditing(p);
    setOpen(true);
  }

  function handleNewPost() {
    create.mutate({
      title: "Novo post sem título",
      copy: "",
      platform: "instagram",
      status: "idea",
      assignee: { id: "u1", name: "Ana Prado" },
      campaignId,
    });
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      <div className="flex items-center justify-between gap-4 border-b border-border/60 px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Campanha</span>
          <Select value={campaignId} onValueChange={setCampaignId}>
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
        <Button onClick={handleNewPost}>
          <Plus /> Novo Post
        </Button>
      </div>
      <main className="flex-1 py-6">
        <KanbanBoard campaignId={campaignId} onOpenPost={handleOpenPost} />
      </main>
      <PostEditorSheet post={editing} open={open} onOpenChange={setOpen} />
    </div>
  );
}