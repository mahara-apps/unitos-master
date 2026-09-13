import { useEffect, useState } from "react";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Code2, Highlighter, ImagePlus, Italic, Link2, List, ListOrdered, Smile, Strikethrough, UnderlineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Props = { value: string | null; onSave: (html: string) => Promise<unknown> | void };

export function JobBriefingEditor({ value, onSave }: Props) {
  const [state, setState] = useState<"saved" | "editing" | "saving" | "error">("saved");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Underline, TextStyle, Color, Highlight.configure({ multicolor: true }), Link.configure({ openOnClick: false }), Image.configure({ allowBase64: false })],
    content: value ?? "",
    editorProps: { attributes: { class: "prose prose-sm dark:prose-invert min-h-44 max-w-none px-4 py-3 focus:outline-none" } },
    onUpdate: () => setState("editing"),
  });

  useEffect(() => {
    if (!editor || state !== "editing") return;
    const timer = window.setTimeout(async () => {
      setState("saving");
      try { await onSave(editor.getHTML()); setState("saved"); } catch { setState("error"); }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [editor, onSave, state]);

  if (!editor) return <div className="h-52 animate-pulse rounded-md bg-muted" />;
  const action = (label: string, active: boolean, run: () => void, icon: React.ReactNode) => (
    <Button key={label} type="button" size="icon" variant={active ? "secondary" : "ghost"} className="h-8 w-8" title={label} aria-label={label} onClick={run}>{icon}</Button>
  );
  const addLink = () => { const href = window.prompt("URL do link (https://)"); if (href?.startsWith("https://")) editor.chain().focus().extendMarkRange("link").setLink({ href }).run(); };
  const addImage = () => { const src = window.prompt("URL segura da imagem (https://)"); if (src?.startsWith("https://")) editor.chain().focus().setImage({ src }).run(); };
  const addEmoji = () => { const emoji = window.prompt("Insira um emoji"); if (emoji?.trim()) editor.chain().focus().insertContent(emoji.trim()).run(); };
  return (
    <section className="border-b border-border/60 px-5 py-5">
      <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Briefing</h3><span className={cn("text-[10px]", state === "error" ? "text-destructive" : "text-muted-foreground")}>{state === "saving" ? "Salvando…" : state === "error" ? "Não foi possível salvar" : "Salvo"}</span></div>
      <div className="overflow-hidden rounded-md border border-border/60 bg-background">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 bg-muted/25 p-1.5">
          <Select value={editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : "normal"} onValueChange={(v) => v === "normal" ? editor.chain().focus().setParagraph().run() : editor.chain().focus().toggleHeading({ level: v === "h2" ? 2 : 3 }).run()}><SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="h2">Título</SelectItem><SelectItem value="h3">Subtítulo</SelectItem></SelectContent></Select>
          {action("Negrito", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), <Bold className="h-4 w-4" />)}
          {action("Itálico", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), <Italic className="h-4 w-4" />)}
          {action("Sublinhado", editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon className="h-4 w-4" />)}
          {action("Tachado", editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), <Strikethrough className="h-4 w-4" />)}
          {action("Link", editor.isActive("link"), addLink, <Link2 className="h-4 w-4" />)}
          <label className="grid h-8 w-8 cursor-pointer place-items-center rounded-md hover:bg-accent" title="Cor do texto"><span className="h-3 w-3 rounded-full border border-border bg-foreground" /><input className="sr-only" type="color" onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} /></label>
          {action("Marca-texto", editor.isActive("highlight"), () => editor.chain().focus().toggleHighlight({ color: "#facc15" }).run(), <Highlighter className="h-4 w-4" />)}
          {action("Lista", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), <List className="h-4 w-4" />)}
          {action("Lista numerada", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="h-4 w-4" />)}
          {action("Código", editor.isActive("codeBlock"), () => editor.chain().focus().toggleCodeBlock().run(), <Code2 className="h-4 w-4" />)}
          {action("Imagem", false, addImage, <ImagePlus className="h-4 w-4" />)}
          {action("Emoji", false, addEmoji, <Smile className="h-4 w-4" />)}
        </div>
        <EditorContent editor={editor} />
      </div>
    </section>
  );
}