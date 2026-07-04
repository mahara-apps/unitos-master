import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { PostCard } from "./post-card";
import type { Post, PostStatus } from "./types";

interface Props {
  id: PostStatus;
  title: string;
  posts: Post[];
  onOpen: (p: Post) => void;
}

export function KanbanColumn({ id, title, posts, onOpen }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: "column", status: id } });

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-muted/40 p-3">
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {posts.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex min-h-24 flex-1 flex-col gap-2 rounded-lg p-1 transition-colors ${
          isOver ? "bg-accent/60 ring-2 ring-primary/30" : ""
        }`}
      >
        <SortableContext items={posts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onOpen={onOpen} />
          ))}
        </SortableContext>

        {posts.length === 0 && (
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border/60 text-xs text-muted-foreground">
            Arraste um post aqui
          </div>
        )}
      </div>
    </div>
  );
}