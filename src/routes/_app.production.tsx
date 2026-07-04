import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCampaigns, createPost } from "@/lib/api/posts";
import { ProductionHeader } from "@/features/production/production-header";
import { KanbanBoard } from "@/features/production/kanban-board";
import { PostEditorSheet } from "@/features/production/post-editor-sheet";
import type { Post } from "@/features/production/types";

export const Route = createFileRoute("/production")({
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
    <div className="flex min-h-screen flex-col bg-background">
      <ProductionHeader
        campaigns={campaigns}
        campaignId={campaignId}
        onCampaignChange={setCampaignId}
        onNewPost={handleNewPost}
      />
      <main className="flex-1 py-6">
        <KanbanBoard campaignId={campaignId} onOpenPost={handleOpenPost} />
      </main>
      <PostEditorSheet post={editing} open={open} onOpenChange={setOpen} />
    </div>
  );
}