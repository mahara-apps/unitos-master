import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ImageIcon, Loader2, Palette as PaletteIcon, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  uploadBrandAsset,
  updateBrandHub,
  updateBrandVisuals,
  type BrandHubClient,
} from "@/lib/brand-hub.functions";
import { extractDominantColors } from "@/lib/extract-colors";

type AssetKind = "logo" | "logo_secondary" | "favicon";
const ASSETS: Array<{ kind: AssetKind; label: string; hint: string }> = [
  { kind: "logo", label: "Main Logo", hint: "PNG or SVG, transparent, up to 5 MB" },
  { kind: "logo_secondary", label: "Secondary Logo", hint: "Alt / mono version" },
  { kind: "favicon", label: "Favicon", hint: "ICO/PNG 32-256 px" },
];

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

function AssetSlot({
  brandId,
  clientId,
  kind,
  label,
  hint,
  currentUrl,
  onChange,
  onExtracted,
}: {
  brandId: string;
  clientId: string;
  kind: AssetKind;
  label: string;
  hint: string;
  currentUrl: string | null;
  onChange: () => void;
  onExtracted?: (colors: string[]) => void;
}) {
  const upload = useServerFn(uploadBrandAsset);
  const clear = useServerFn(updateBrandVisuals);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Asset must be under 5 MB");
      return;
    }
    setBusy(true);
    try {
      const base64 = await fileToBase64(file);
      await upload({
        data: { brandId, clientId, kind, filename: file.name, contentType: file.type || "application/octet-stream", base64 },
      });
      toast.success(`${label} uploaded`);
      onChange();
      // Auto color extraction for logo variants
      if (onExtracted && (kind === "logo" || kind === "logo_secondary")) {
        try {
          const dataUrl = `data:${file.type || "image/png"};base64,${base64}`;
          const colors = await extractDominantColors(dataUrl, 6);
          if (colors.length) onExtracted(colors.map((c) => c.hex));
        } catch {
          // silent — extraction is best-effort
        }
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const removeAsset = async () => {
    const col = kind === "logo" ? "logo_url" : kind === "favicon" ? "favicon_url" : "logo_secondary_url";
    await clear({ data: { brandId, clientId, patch: { [col]: null } as never } });
    toast.success(`${label} removed`);
    onChange();
  };

  return (
    <div
      className={
        "flex flex-col rounded-xl border p-4 transition " +
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
        const f = e.dataTransfer.files?.[0];
        if (f) void handleFile(f);
      }}
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold">{label}</div>
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        </div>
        {currentUrl ? (
          <Button size="icon" variant="ghost" onClick={removeAsset} title="Remove">
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        ) : null}
      </div>
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border bg-background">
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : currentUrl ? (
          <img src={currentUrl} alt={label} className="max-h-28 max-w-full object-contain" />
        ) : (
          <div className="text-center text-[11px] text-muted-foreground">
            <ImageIcon className="mx-auto mb-1 h-5 w-5" />
            Drop file or click to upload
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Upload className="h-3.5 w-3.5" /> Upload
        </Button>
        {currentUrl ? (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={() => {
              navigator.clipboard.writeText(currentUrl);
              toast.success("Asset URL copied");
            }}
          >
            <Copy className="h-3.5 w-3.5" /> Copy URL
          </Button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

export function VisualIdentityTab({
  brandId,
  clientId,
  client,
  onSaved,
}: {
  brandId: string;
  clientId: string;
  client: BrandHubClient;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const saveHub = useServerFn(updateBrandHub);
  const [palette, setPalette] = useState(
    client.brand_hub.palette ?? [
      { label: "Primary", hex: "#6366f1" },
      { label: "Secondary", hex: "#0ea5e9" },
      { label: "Accent", hex: "#f59e0b" },
    ],
  );
  const [extracted, setExtracted] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (client.brand_hub.palette) setPalette(client.brand_hub.palette);
  }, [client.brand_hub.palette]);

  const savePalette = useMutation({
    mutationFn: () =>
      saveHub({ data: { brandId, clientId, patch: { palette } } }),
    onSuccess: () => {
      toast.success("Palette saved");
      qc.invalidateQueries({ queryKey: ["brand-hub", brandId, clientId] });
      onSaved();
    },
  });

  const currentByKind: Record<AssetKind, string | null> = {
    logo: client.logo_url,
    logo_secondary: client.logo_secondary_url,
    favicon: client.favicon_url,
  };

  const handleExtracted = (colors: string[]) => {
    const existing = new Set(palette.map((p) => p.hex.toLowerCase()));
    const fresh = colors.filter((c) => !existing.has(c.toLowerCase()));
    if (!fresh.length) {
      toast.info("Nenhuma cor nova detectada na logo");
      return;
    }
    setExtracted(fresh);
    setPicked(Object.fromEntries(fresh.map((c) => [c, true])));
  };

  const confirmAddExtracted = () => {
    if (!extracted) return;
    const additions = extracted
      .filter((hex) => picked[hex])
      .map((hex, i) => ({ label: `Extracted ${palette.length + i + 1}`, hex }));
    if (additions.length) {
      setPalette((p) => [...p, ...additions]);
      toast.success(`${additions.length} cor(es) adicionada(s) — clique em Save palette`);
    }
    setExtracted(null);
    setPicked({});
  };

  return (
    <div className="space-y-6">
      <section>
        <header className="mb-3">
          <h3 className="text-sm font-semibold">Logo Asset Manager</h3>
          <p className="text-xs text-muted-foreground">
            Drag and drop or upload corporate assets. Files are stored securely and served via signed URLs.
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          {ASSETS.map((a) => (
            <AssetSlot
              key={a.kind}
              brandId={brandId}
              clientId={clientId}
              kind={a.kind}
              label={a.label}
              hint={a.hint}
              currentUrl={currentByKind[a.kind]}
              onChange={onSaved}
              onExtracted={handleExtracted}
            />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Brand Color Palette</h3>
            <p className="text-xs text-muted-foreground">
              Click a swatch to copy its hex code instantly.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setPalette((p) => [...p, { label: `Color ${p.length + 1}`, hex: "#000000" }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add color
          </Button>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {palette.map((c, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(c.hex);
                  toast.success(`${c.hex} copied`);
                }}
                className="h-11 w-11 shrink-0 rounded-md border border-border shadow-sm transition hover:scale-105"
                style={{ background: c.hex }}
                title="Click to copy"
              />
              <div className="grid flex-1 grid-cols-[1fr,140px] gap-2">
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Label</Label>
                  <Input
                    value={c.label}
                    onChange={(e) =>
                      setPalette((p) => p.map((x, j) => (i === j ? { ...x, label: e.target.value } : x)))
                    }
                    className="h-8 bg-card text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Hex</Label>
                  <Input
                    value={c.hex}
                    onChange={(e) => {
                      const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                      setPalette((p) => p.map((x, j) => (i === j ? { ...x, hex: v } : x)));
                    }}
                    className="h-8 bg-card font-mono text-xs uppercase"
                    maxLength={7}
                  />
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setPalette((p) => p.filter((_, j) => j !== i))}
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => savePalette.mutate()} disabled={savePalette.isPending} className="gap-2">
            {savePalette.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save palette
          </Button>
        </div>
      </section>

      <Dialog open={!!extracted} onOpenChange={(o) => !o && setExtracted(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PaletteIcon className="h-4 w-4" /> Cores detectadas na logo
            </DialogTitle>
            <DialogDescription>
              Extraímos as cores dominantes da logo. Selecione quais adicionar ao Brand Color Palette.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 py-2">
            {(extracted ?? []).map((hex) => {
              const on = !!picked[hex];
              return (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setPicked((p) => ({ ...p, [hex]: !p[hex] }))}
                  className={
                    "group flex flex-col items-center gap-1.5 rounded-lg border p-2 text-[11px] transition " +
                    (on ? "border-primary ring-2 ring-primary/30" : "border-border opacity-60 hover:opacity-100")
                  }
                >
                  <span
                    className="h-12 w-full rounded-md border border-border"
                    style={{ background: hex }}
                  />
                  <span className="font-mono uppercase">{hex}</span>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExtracted(null)}>
              Não, obrigado
            </Button>
            <Button onClick={confirmAddExtracted} className="gap-2">
              <Plus className="h-3.5 w-3.5" /> Adicionar à paleta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}