import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2, Upload, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PanelEmptyState } from "@/components/ui/panel-empty";
import { DashboardPanelSurface } from "@/components/ui/dashboard-primitives";
import {
  deleteBrandMediaFn,
  listBrandMediaFn,
  registerBrandMediaFn,
  type BrandMediaAsset,
} from "@/lib/brand-media.functions";

function slugifyName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

export function MediaLibraryPanel({ brandId }: { brandId: string }) {
  const list = useServerFn(listBrandMediaFn);
  const register = useServerFn(registerBrandMediaFn);
  const remove = useServerFn(deleteBrandMediaFn);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["brand-media", brandId],
    queryFn: () => list({ data: { brandId, limit: 120 } }),
  });

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const path = `${brandId}/${crypto.randomUUID()}-${slugifyName(file.name)}`;
        const { error: upErr } = await supabase.storage
          .from("brand-media")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw new Error(upErr.message);
        await register({
          data: {
            brandId,
            storagePath: path,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            tags: [],
          },
        });
      }
      toast.success(`${files.length} arquivo(s) enviados`);
      qc.invalidateQueries({ queryKey: ["brand-media", brandId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(asset: BrandMediaAsset) {
    if (!confirm(`Excluir "${asset.name}"?`)) return;
    try {
      await remove({ data: { id: asset.id, brandId } });
      qc.invalidateQueries({ queryKey: ["brand-media", brandId] });
      toast.success("Mídia removida");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const items = q.data ?? [];

  return (
    <DashboardPanelSurface>
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div>
          <div className="text-sm font-semibold tracking-tight">Biblioteca de mídia</div>
          <div className="text-xs text-muted-foreground">
            Arquivos disponíveis para reuso no Composer. Escopo: marca atual.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-4 w-4" />
            )}
            Enviar mídia
          </Button>
        </div>
      </div>
      {q.isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : items.length === 0 ? (
        <PanelEmptyState
          icon={<ImagePlus className="h-5 w-5" />}
          text="Nenhuma mídia por aqui ainda. Envie imagens ou vídeos para reutilizar nas publicações."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((a) => (
            <div
              key={a.id}
              className="group relative overflow-hidden rounded-lg border border-border/60 bg-muted/40"
            >
              <div className="aspect-square w-full bg-muted">
                {a.kind === "image" && a.publicUrl ? (
                  <img
                    src={a.publicUrl}
                    alt={a.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : a.kind === "video" && a.publicUrl ? (
                  <video src={a.publicUrl} className="h-full w-full object-cover" muted />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 p-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium">{a.name}</div>
                  <Badge variant="outline" className="mt-0.5 h-4 px-1 text-[10px]">
                    {a.kind}
                  </Badge>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 opacity-0 transition group-hover:opacity-100"
                  onClick={() => handleDelete(a)}
                  aria-label="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardPanelSurface>
  );
}