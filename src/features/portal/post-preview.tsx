import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Calendar } from "lucide-react";
import { PlatformIcon, platformLabel } from "@/features/production/platform-icon";
import type { PortalPost } from "./mock-data";

function renderCaption(text: string) {
  return text.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className="min-h-[1em]">
        {parts.map((part, j) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={j} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          ) : (
            <span key={j}>{part}</span>
          ),
        )}
      </p>
    );
  });
}

export function PostPreview({ post }: { post: PortalPost }) {
  const scheduled = new Date(post.scheduledFor).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm dark:border-slate-800 dark:bg-slate-900/60 dark:shadow-none">
      {/* Feed-style header */}
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-semibold text-white">
            {post.brand.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{post.brand.name}</div>
            <div className="truncate text-xs text-muted-foreground">{post.brand.handle}</div>
          </div>
        </div>
        <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
      </header>

      {/* Image */}
      <div className="aspect-square w-full overflow-hidden bg-muted">
        <img src={post.imageUrl} alt="" className="h-full w-full object-cover" />
      </div>

      {/* Interaction row (visual only) */}
      <div className="flex items-center justify-between px-4 pt-3 text-foreground">
        <div className="flex items-center gap-4">
          <Heart className="h-5 w-5" />
          <MessageCircle className="h-5 w-5" />
          <Send className="h-5 w-5" />
        </div>
        <Bookmark className="h-5 w-5" />
      </div>

      {/* Caption */}
      <div className="space-y-2 px-4 pb-4 pt-3 text-sm leading-relaxed text-muted-foreground">
        {renderCaption(post.caption)}
        <p className="pt-1 text-sm text-sky-600 dark:text-sky-400">
          {post.hashtags.map((t) => `#${t}`).join(" ")}
        </p>
      </div>

      {/* Meta tags */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-muted/40 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs font-medium text-foreground dark:border-slate-800 dark:bg-slate-950">
          <PlatformIcon platform={post.platform} />
          {platformLabel(post.platform)}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs text-muted-foreground dark:border-slate-800 dark:bg-slate-950">
          <Calendar className="h-3.5 w-3.5" />
          Publicação sugerida: {scheduled}
        </span>
      </div>
    </article>
  );
}