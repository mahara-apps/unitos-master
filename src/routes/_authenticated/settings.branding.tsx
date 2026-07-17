import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Palette, Upload, Loader2, Trash2, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { updateBrandBranding } from "@/lib/branding.functions";
import { useActiveContext } from "@/hooks/use-active-context";
import { useBrandBranding } from "@/hooks/use-brand-branding";
import { usePageHeader } from "@/hooks/use-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings/branding")({
  component: BrandingPage,
});

type Kind = "logo_light" | "logo_dark" | "icon";

type SlotSpec = {
  kind: Kind;
  title: string;
  description: string;
  hint: string;
  minWidth: number;
  minHeight: number;
  maxBytes: number;
  previewBg: "light" | "dark" | "icon";
  square?: boolean;
  previewClass: string;
};

const SLOTS: SlotSpec[] = [
  {
    kind: "logo_light",
    title: "Logo — tema claro",
    description: "Usada no sidebar em fundo claro e nas telas de login e recuperação de senha.",
    hint: "PNG ou SVG com fundo transparente • Dimensão ideal 480×120 px (proporção 4:1) • Mín. 240×60 • até 500 KB",
    minWidth: 240,
    minHeight: 60,
    maxBytes: 500 * 1024,
    previewBg: "light",
    previewClass: "h-16 w-auto max-w-[280px]",
  },
  {
    kind: "logo_dark",
    title: "Logo — tema escuro",
    description: "Usada no sidebar em fundo escuro e nas telas de login/recuperação em modo escuro.",
    hint: "PNG ou SVG com fundo transparente • Dimensão ideal 480×120 px (proporção 4:1) • Mín. 240×60 • até 500 KB",
    minWidth: 240,
    minHeight: 60,
    maxBytes: 500 * 1024,
    previewBg: "dark",
    previewClass: "h-16 w-auto max-w-[280px]",
  },
  {
    kind: "icon",
    title: "Ícone / Favicon",
    description: "Aparece no sidebar recolhido e como favicon do navegador. Deve ser quadrado.",
    hint: "PNG ou SVG quadrado • Dimensão ideal 256×256 px • Mín. 128×128 • até 200 KB",
    minWidth: 128,
    minHeight: 128,
    maxBytes: 200 * 1024,
    previewBg: "icon",
    square: true,
    previewClass: "h-16 w-16",
  },
];

function BrandingPage() {
  const { brandId } = useActiveContext();
  usePageHeader({ title: "Marca", subtitle: "Identidade visual usada no sistema" }, []);

  if (!brandId) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6">
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Selecione um workspace no menu lateral para editar a identidade visual.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
        <Palette className="mt-0.5 h-5 w-5 text-primary" />
        <div className="text-sm">
          <p className="font-medium">Identidade visual desta marca</p>
          <p className="text-muted-foreground">
            Faça upload das versões clara e escura do seu logo, além de um ícone quadrado
            para o sidebar colapsado e favicon. As trocas aparecem em segundos após o salvamento.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {SLOTS.map((s) => (
          <BrandingSlot key={s.kind} brandId={brandId} spec={s} />
        ))}
      </div>
    </div>
  );
}

function BrandingSlot({ brandId, spec }: { brandId: string; spec: SlotSpec }) {
  const qc = useQueryClient();
  const branding = useBrandBranding(brandId);
  const save = useServerFn(updateBrandBranding);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const currentPath =
    spec.kind === "logo_light"
      ? branding.paths.logo_light
      : spec.kind === "logo_dark"
        ? branding.paths.logo_dark
        : branding.paths.icon;

  const previewSrc =
    spec.kind === "logo_light" ? branding.logoLight : spec.kind === "logo_dark" ? branding.logoDark : branding.icon;
  const isCustom =
    spec.kind === "logo_light"
      ? branding.logoLightCustom
      : spec.kind === "logo_dark"
        ? branding.logoDarkCustom
        : branding.iconCustom;

  async function readImageDims(file: File): Promise<{ w: number; h: number }> {
    if (file.type === "image/svg+xml") return { w: 9999, h: 9999 };
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error("Não foi possível ler a imagem"));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp|svg\+xml)$/.test(file.type)) {
      toast.error("Formato inválido — use PNG, JPG, WEBP ou SVG");
      return;
    }
    if (file.size > spec.maxBytes) {
      toast.error(`Arquivo muito grande — limite ${Math.round(spec.maxBytes / 1024)} KB`);
      return;
    }
    setBusy(true);
    try {
      const dims = await readImageDims(file);
      if (dims.w < spec.minWidth || dims.h < spec.minHeight) {
        throw new Error(`Dimensão mínima ${spec.minWidth}×${spec.minHeight} px`);
      }
      if (spec.square && dims.w !== dims.h) {
        throw new Error("O ícone precisa ser quadrado");
      }
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${brandId}/${spec.kind}-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("brand-assets").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (up.error) throw up.error;

      // Remove old file if present
      if (currentPath) {
        await supabase.storage.from("brand-assets").remove([currentPath]);
      }

      await save({ data: { brandId, kind: spec.kind, storagePath: path } });
      toast.success("Imagem atualizada");
      await qc.invalidateQueries({ queryKey: ["brand-branding", brandId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setBusy(false);
    }
  }

  const removeMut = useMutation({
    mutationFn: async () => {
      if (currentPath) await supabase.storage.from("brand-assets").remove([currentPath]);
      await save({ data: { brandId, kind: spec.kind, storagePath: null } });
    },
    onSuccess: async () => {
      toast.success("Voltou ao padrão");
      await qc.invalidateQueries({ queryKey: ["brand-branding", brandId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao remover"),
  });

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{spec.title}</CardTitle>
        <CardDescription>{spec.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div
          className={cn(
            "flex items-center justify-center rounded-lg border border-dashed border-border/60 p-6",
            spec.previewBg === "dark" && "bg-neutral-950",
            spec.previewBg === "light" && "bg-neutral-50",
            spec.previewBg === "icon" && "bg-muted/50",
          )}
        >
          {previewSrc ? (
            <img src={previewSrc} alt="preview" className={cn("object-contain", spec.previewClass)} />
          ) : (
            <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
          )}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{spec.hint}</p>
        <div className="mt-auto flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={onPick}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex-1"
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {isCustom ? "Substituir" : "Enviar imagem"}
          </Button>
          {isCustom && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={removeMut.isPending || busy}
              onClick={() => removeMut.mutate()}
            >
              {removeMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}