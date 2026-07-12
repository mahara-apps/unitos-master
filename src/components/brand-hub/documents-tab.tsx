import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Loader2, MoreHorizontal, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteClientDocument,
  listClientDocuments,
  signClientDocument,
  uploadClientDocument,
} from "@/lib/brand-hub.functions";

function fmtSize(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

export function DocumentsTab({ brandId, clientId }: { brandId: string; clientId: string }) {
  const list = useServerFn(listClientDocuments);
  const upload = useServerFn(uploadClientDocument);
  const remove = useServerFn(deleteClientDocument);
  const sign = useServerFn(signClientDocument);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const docsQ = useQuery({
    queryKey: ["client-documents", brandId, clientId],
    queryFn: () => list({ data: { brandId, clientId } }),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["client-documents", brandId, clientId] });

  const handleFiles = async (files: FileList) => {
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 25 * 1024 * 1024) {
          toast.error(`${file.name} exceeds 25 MB limit`);
          continue;
        }
        const base64 = await fileToBase64(file);
        await upload({
          data: {
            brandId,
            clientId,
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            base64,
          },
        });
      }
      toast.success("Documents uploaded");
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { brandId, clientId, documentId: id } }),
    onSuccess: () => {
      toast.success("Document deleted");
      invalidate();
    },
  });

  const download = async (id: string) => {
    try {
      const { url } = await sign({ data: { brandId, clientId, documentId: id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Failed to sign URL");
    }
  };

  const docs = docsQ.data ?? [];

  return (
    <div className="space-y-4">
      <section
        className={
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition " +
          (dragging ? "border-primary bg-primary/5" : "border-border bg-card")
        }
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
        }}
      >
        {busy ? (
          <Loader2 className="mb-2 h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
        )}
        <div className="text-sm font-medium">Document Vault</div>
        <p className="mt-1 max-w-md text-center text-xs text-muted-foreground">
          Drop PDFs, brand handbooks, SWOT analyses, or pitch decks here. Files are stored privately and served through signed URLs. Max 25 MB per file.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-4 gap-1.5"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Upload className="h-3.5 w-3.5" /> Browse files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50%]">Name</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Size</TableHead>
              <TableHead className="w-16 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docsQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-xs text-muted-foreground">
                  Loading documents…
                </TableCell>
              </TableRow>
            ) : docs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-xs text-muted-foreground">
                  No documents yet. Upload a PDF above to get started.
                </TableCell>
              </TableRow>
            ) : (
              docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{d.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(d.created_at).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{fmtSize(d.size_bytes)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => download(d.id)}>
                          <Download className="mr-2 h-3.5 w-3.5" /> Download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => del.mutate(d.id)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}