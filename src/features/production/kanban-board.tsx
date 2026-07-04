import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPosts, updatePost } from "@/lib/api/posts";
import { COLUMNS, type Post, type PostStatus } from "./types";
import { KanbanColumn } from "./kanban-column";
import { PostCard } from "./post-card";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  campaignId: string;
  onOpenPost: (post: Post) => void;
}

export function KanbanBoard({ campaignId, onOpenPost }: Props) {
  const queryClient = useQueryClient();
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["posts", campaignId],
    queryFn: () => fetchPosts(campaignId),
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const grouped = useMemo(() => {
    const map: Record<PostStatus, Post[]> = {
      idea: [],
      in_production: [],
      internal_review: [],
      client_review: [],
      approved: [],
    };
    for (const p of posts) map[p.status].push(p);
    return map;
  }, [posts]);

  const mutation = useMutation({
    mutationFn: updatePost,
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ["posts", campaignId] });
      const prev = queryClient.getQueryData<Post[]>(["posts", campaignId]);
      queryClient.setQueryData<Post[]>(["posts", campaignId], (old = []) =>
        old.map((p) => (p.id === next.id ? next : p)),
      );
      return { prev };
    },
    onError: (_e, _n, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["posts", campaignId], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["posts", campaignId] }),
  });

  const activePost = activeId ? posts.find((p) => p.id === activeId) ?? null : null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const post = posts.find((p) => p.id === active.id);
    if (!post) return;

    const overData = over.data.current as { type?: string; status?: PostStatus; post?: Post } | undefined;
    const targetStatus: PostStatus | undefined =
      overData?.type === "column" ? overData.status : overData?.post?.status;
    if (!targetStatus || targetStatus === post.status) return;

    mutation.mutate({ ...post, status: targetStatus, updatedAt: new Date().toISOString() });
  }

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto px-6 pb-6">
        {COLUMNS.map((c) => (
          <div key={c.id} className="w-72 shrink-0 space-y-2 rounded-xl bg-muted/40 p-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto px-6 pb-6">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            title={col.title}
            posts={grouped[col.id]}
            onOpen={onOpenPost}
          />
        ))}
      </div>

      <DragOverlay>
        {activePost ? (
          <div className="w-72 rotate-2">
            <PostCard post={activePost} onOpen={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}