import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  RotateCcw,
  Send,
  Save,
  Eye,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import {
  EVENTS,
  getEvent,
  getDefault,
  renderTemplateString,
  buildSampleContext,
  type Channel,
  type EventDef,
} from "@/lib/message-templates.catalog";
import {
  listTemplates,
  upsertTemplate,
  resetTemplate,
  sendTestMessage,
  type TemplateRecord,
} from "@/lib/message-templates.functions";

type Props = { brandId: string };

function templateKey(brandId: string) {
  return ["message-templates", brandId] as const;
}

function findRecord(rows: TemplateRecord[], eventKey: string, channel: Channel) {
  return rows.find((r) => r.event_key === eventKey && r.channel === channel);
}

const CATEGORY_ORDER = [
  "Time",
  "Cliente",
  "Portal",
  "Aprovação",
  "Produção",
  "Relatórios",
  "Financeiro",
] as const;

export function TemplateEditor({ brandId }: Props) {
  const qc = useQueryClient();
  const list = useServerFn(listTemplates);
  const upsert = useServerFn(upsertTemplate);
  const reset = useServerFn(resetTemplate);
  const sendTest = useServerFn(sendTestMessage);

  const { data, isLoading } = useQuery({
    queryKey: templateKey(brandId),
    queryFn: () => list({ data: { brandId } }),
    enabled: !!brandId,
  });

  const rows: TemplateRecord[] = data?.templates ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, EventDef[]>();
    for (const e of EVENTS) {
      if (!map.has(e.category)) map.set(e.category, []);
      map.get(e.category)!.push(e);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
      category: c,
      items: map.get(c)!,
    }));
  }, []);

  const [selectedKey, setSelectedKey] = useState<string>(EVENTS[0]?.key ?? "");
  const selected = getEvent(selectedKey);
  const [channel, setChannel] = useState<Channel>(
    (selected?.channels[0] as Channel) ?? "email",
  );

  useEffect(() => {
    if (selected && !selected.channels.includes(channel)) {
      setChannel(selected.channels[0]);
    }
  }, [selectedKey, channel, selected]);

  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <div className="text-sm font-medium">Templates de comunicação</div>
        <div className="text-xs text-muted-foreground">
          Personalize e-mails e mensagens de WhatsApp disparados por eventos do sistema.
          Use variáveis <code className="rounded bg-muted px-1">{"{{brand.name}}"}</code> para
          personalização automática.
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[260px_1fr]">
        <aside className="border-b lg:border-b-0 lg:border-r">
          <ScrollArea className="h-[520px]">
            <div className="p-2">
              {grouped.map((g) => (
                <div key={g.category} className="mb-3">
                  <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {g.category}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {g.items.map((ev) => {
                      const active = ev.key === selectedKey;
                      const overridden = ev.channels.some((c) =>
                        findRecord(rows, ev.key, c as Channel),
                      );
                      return (
                        <button
                          key={ev.key}
                          type="button"
                          onClick={() => setSelectedKey(ev.key)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                            active && "bg-accent",
                          )}
                        >
                          <span className="truncate">{ev.name}</span>
                          {overridden && (
                            <span className="ml-2 h-1.5 w-1.5 rounded-full bg-primary" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </aside>

        <section className="min-h-[520px]">
          {isLoading ? (
            <div className="flex h-[520px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : selected ? (
            <EventEditor
              key={`${selected.key}-${channel}`}
              brandId={brandId}
              event={selected}
              channel={channel}
              onChangeChannel={setChannel}
              record={findRecord(rows, selected.key, channel)}
              onSaved={() => qc.invalidateQueries({ queryKey: templateKey(brandId) })}
              upsert={(payload) => upsert({ data: payload })}
              reset={(payload) => reset({ data: payload })}
              sendTest={(payload) => sendTest({ data: payload })}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

type EventEditorProps = {
  brandId: string;
  event: EventDef;
  channel: Channel;
  onChangeChannel: (c: Channel) => void;
  record?: TemplateRecord;
  onSaved: () => void;
  upsert: (payload: {
    brandId: string;
    eventKey: string;
    channel: Channel;
    subject?: string | null;
    body: string;
    isActive: boolean;
  }) => Promise<{ template: TemplateRecord }>;
  reset: (payload: {
    brandId: string;
    eventKey: string;
    channel: Channel;
  }) => Promise<{ ok: boolean }>;
  sendTest: (payload: {
    brandId: string;
    eventKey: string;
    channel: Channel;
    subject?: string | null;
    body: string;
    to: string;
  }) => Promise<{ sent: boolean; error?: string; previewSubject?: string; previewBody?: string }>;
};

function EventEditor({
  brandId,
  event,
  channel,
  onChangeChannel,
  record,
  onSaved,
  upsert,
  reset,
  sendTest,
}: EventEditorProps) {
  const defaults = getDefault(event.key, channel);
  const initialSubject = record?.subject ?? defaults?.subject ?? "";
  const initialBody = record?.body ?? defaults?.body ?? "";

  const [subject, setSubject] = useState<string>(initialSubject);
  const [testTo, setTestTo] = useState<string>("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Escreva o conteúdo do template…" }),
    ],
    content: initialBody,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[240px] px-4 py-3 focus:outline-none",
      },
    },
  });

  const savedRef = useRef({ subject: initialSubject, body: initialBody });

  const currentBody = () => (channel === "email" ? editor?.getHTML() ?? "" : editor?.getText() ?? "");

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = currentBody();
      if (!body || body === "<p></p>") throw new Error("Conteúdo vazio.");
      return upsert({
        brandId,
        eventKey: event.key,
        channel,
        subject: channel === "email" ? subject : null,
        body,
        isActive: true,
      });
    },
    onSuccess: () => {
      savedRef.current = { subject, body: currentBody() };
      toast.success("Template salvo");
      onSaved();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  const resetMut = useMutation({
    mutationFn: () => reset({ brandId, eventKey: event.key, channel }),
    onSuccess: () => {
      const d = getDefault(event.key, channel);
      setSubject(d?.subject ?? "");
      editor?.commands.setContent(d?.body ?? "");
      toast.success("Template restaurado ao padrão");
      onSaved();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao restaurar"),
  });

  const testMut = useMutation({
    mutationFn: () => {
      if (!testTo.trim()) throw new Error("Informe um destinatário.");
      return sendTest({
        brandId,
        eventKey: event.key,
        channel,
        subject: channel === "email" ? subject : null,
        body: currentBody(),
        to: testTo.trim(),
      });
    },
    onSuccess: (r) => {
      if (r.sent) toast.success("Mensagem de teste enviada");
      else toast.error(r.error ? `Não enviado: ${r.error}` : "Não enviado");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha no envio"),
  });

  const sampleCtx = useMemo(() => buildSampleContext(event), [event]);
  const previewSubject = renderTemplateString(subject, sampleCtx);
  const previewBody = renderTemplateString(currentBody(), sampleCtx);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <div className="text-sm font-medium">{event.name}</div>
          <div className="text-xs text-muted-foreground">{event.description}</div>
        </div>
        <div className="flex items-center gap-2">
          {event.channels.length > 1 ? (
            <Tabs value={channel} onValueChange={(v) => onChangeChannel(v as Channel)}>
              <TabsList>
                {event.channels.map((c) => (
                  <TabsTrigger key={c} value={c} className="capitalize">
                    {c === "email" ? "E-mail" : "WhatsApp"}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : (
            <Badge variant="secondary" className="capitalize">
              {channel === "email" ? "E-mail" : "WhatsApp"}
            </Badge>
          )}
          <Tabs value={mode} onValueChange={(v) => setMode(v as "edit" | "preview")}>
            <TabsList>
              <TabsTrigger value="edit">Editar</TabsTrigger>
              <TabsTrigger value="preview">
                <Eye className="mr-1 h-3.5 w-3.5" />
                Preview
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="grid flex-1 gap-0 lg:grid-cols-[1fr_260px]">
        <div className="flex min-h-[380px] flex-col">
          {channel === "email" && mode === "edit" && (
            <div className="border-b px-4 py-3">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Assunto
              </label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex.: Novo post para aprovar · {{post.title}}"
                className="mt-1"
              />
            </div>
          )}

          {mode === "edit" ? (
            <>
              <Toolbar editor={editor} />
              <div className="flex-1 overflow-auto">
                <EditorContent editor={editor} />
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-auto p-4">
              {channel === "email" && (
                <>
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Assunto
                  </div>
                  <div className="mb-4 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    {previewSubject || "—"}
                  </div>
                </>
              )}
              {channel === "email" ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none rounded-md border p-4"
                  dangerouslySetInnerHTML={{ __html: previewBody }}
                />
              ) : (
                <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-4 font-sans text-sm">
                  {previewBody}
                </pre>
              )}
            </div>
          )}
        </div>

        <aside className="border-t lg:border-l lg:border-t-0">
          <div className="p-3">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Variáveis disponíveis
            </div>
            <div className="flex flex-wrap gap-1">
              {event.variables.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => {
                    const token = `{{${v.key}}}`;
                    if (channel === "email") {
                      editor?.chain().focus().insertContent(token).run();
                    } else {
                      editor?.chain().focus().insertContent(token).run();
                    }
                  }}
                  className="rounded-md border bg-background px-2 py-1 text-[11px] hover:bg-accent"
                  title={v.label}
                >
                  <span className="font-mono">{`{{${v.key}}}`}</span>
                </button>
              ))}
            </div>
            <Separator className="my-3" />
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Envio de teste
            </div>
            <Input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder={
                channel === "email" ? "email@dominio.com" : "+55 11 90000-0000"
              }
            />
            <Button
              size="sm"
              variant="secondary"
              className="mt-2 w-full"
              onClick={() => testMut.mutate()}
              disabled={testMut.isPending}
            >
              {testMut.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-2 h-3.5 w-3.5" />
              )}
              Enviar teste
            </Button>
          </div>
        </aside>
      </div>

      <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-4 py-3">
        <div className="text-[11px] text-muted-foreground">
          {record
            ? `Personalizado — atualizado em ${new Date(record.updated_at).toLocaleString("pt-BR")}`
            : "Usando template padrão do sistema"}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => resetMut.mutate()}
            disabled={!record || resetMut.isPending}
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Restaurar padrão
          </Button>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-2 h-3.5 w-3.5" />
            )}
            Salvar template
          </Button>
        </div>
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  const Btn = ({
    onClick,
    active,
    children,
    title,
  }: {
    onClick: () => void;
    active?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
  return (
    <div className="flex items-center gap-0.5 border-b px-2 py-1">
      <Btn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Negrito"
      >
        <Bold className="h-3.5 w-3.5" />
      </Btn>
      <Btn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Itálico"
      >
        <Italic className="h-3.5 w-3.5" />
      </Btn>
      <Btn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Lista"
      >
        <List className="h-3.5 w-3.5" />
      </Btn>
      <Btn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Lista numerada"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </Btn>
      <Btn
        onClick={() => {
          const url = window.prompt("URL do link");
          if (!url) return;
          editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
        active={editor.isActive("link")}
        title="Link"
      >
        <Link2 className="h-3.5 w-3.5" />
      </Btn>
    </div>
  );
}