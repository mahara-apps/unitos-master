import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PlatformIcon } from "./platform-icon";
import type { Post } from "./types";
import { ImageIcon } from "lucide-react";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function PostCard({ post, onOpen }: { post: Post; onOpen: (p: Post) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: post.id,
    data: { type: "post", post },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(post)}
      className="group cursor-grab rounded-lg border border-border/70 bg-card p-3 shadow-sm ring-1 ring-transparent transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-md hover:ring-border/60 active:cursor-grabbing"
    >
      {post.imageUrl ? (
        <div className="mb-3 aspect-video overflow-hidden rounded-md bg-muted">
          <img
            src={post.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="mb-3 flex aspect-video items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
          <ImageIcon className="h-5 w-5" />
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <h4 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {post.title}
        </h4>
        <PlatformIcon platform={post.platform} />
      </div>

      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{post.copy}</p>

      <div className="mt-3 flex items-center justify-between">
        <Avatar className="h-6 w-6">
          <AvatarFallback className="text-[10px]">{initials(post.assignee.name)}</AvatarFallback>
        </Avatar>
        <span className="text-[10px] text-muted-foreground">{post.assignee.name}</span>
      </div>
    </div>
  );
}