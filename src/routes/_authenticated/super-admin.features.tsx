import * as React from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Check, ChevronsUpDown, ShieldAlert } from "lucide-react";

import { usePageHeader } from "@/hooks/use-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  amISuperAdmin,
  listBrandFeatures,
  listBrandsWithFeatureCounts,
  setBrandFeature,
} from "@/lib/feature-flags.functions";

export const Route = createFileRoute("/_authenticated/super-admin/features")({
  beforeLoad: async () => {
    const { isSuperAdmin } = await amISuperAdmin();
    if (!isSuperAdmin) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: SuperAdminFeaturesRoute,
});

function SuperAdminFeaturesRoute() {
  usePageHeader(
    {
      title: "Super Admin · Feature Flags",
      subtitle: "Ative módulos vendáveis por marca. Alterações têm efeito imediato.",
    },
    [],
  );

  const listBrands = useServerFn(listBrandsWithFeatureCounts);
  const brandsQ = useQuery({
    queryKey: ["sa-brands"],
    queryFn: () => listBrands(),
  });

  const [brandId, setBrandId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!brandId && brandsQ.data?.length) setBrandId(brandsQ.data[0].id);
  }, [brandsQ.data, brandId]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
        <ShieldAlert className="h-4 w-4 text-destructive" />
        <span className="text-sm text-destructive">Área restrita — Super Admin</span>
        <Badge variant="outline" className="ml-auto border-destructive/40 text-destructive">
          controle global
        </Badge>
      </div>

      <BrandPicker
        brands={brandsQ.data ?? []}
        value={brandId}
        onChange={setBrandId}
        loading={brandsQ.isLoading}
      />

      {brandId ? <FeaturesGrid brandId={brandId} /> : null}
    </div>
  );
}

function BrandPicker({
  brands,
  value,
  onChange,
  loading,
}: {
  brands: Array<{ id: string; name: string; slug: string; color: string | null; active_features: number }>;
  value: string | null;
  onChange: (id: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const active = brands.find((b) => b.id === value);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-muted-foreground">Marca</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-[320px] justify-between">
            {loading ? "Carregando…" : active ? active.name : "Selecione uma marca"}
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar marca…" />
            <CommandList>
              <CommandEmpty>Nenhuma marca encontrada.</CommandEmpty>
              <CommandGroup>
                {brands.map((b) => (
                  <CommandItem
                    key={b.id}
                    value={`${b.name} ${b.slug}`}
                    onSelect={() => {
                      onChange(b.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === b.id ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">{b.name}</span>
                    <Badge variant="secondary" className="ml-2">
                      {b.active_features}
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function FeaturesGrid({ brandId }: { brandId: string }) {
  const listFn = useServerFn(listBrandFeatures);
  const q = useQuery({
    queryKey: ["brand-features", brandId, "sa"],
    queryFn: () => listFn({ data: { brandId } }),
  });

  if (q.isLoading) return <div className="text-sm text-muted-foreground">Carregando features…</div>;
  const groups = new Map<string, typeof q.data>();
  for (const f of q.data ?? []) {
    const cat = f.category ?? "Outros";
    if (!groups.has(cat)) groups.set(cat, [] as typeof q.data);
    groups.get(cat)!.push(f);
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([cat, items]) => (
        <div key={cat} className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {cat}
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {items!.map((f) => (
              <FeatureCard key={f.key} brandId={brandId} feature={f} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FeatureCard({
  brandId,
  feature,
}: {
  brandId: string;
  feature: NonNullable<Awaited<ReturnType<typeof listBrandFeatures>>>[number];
}) {
  const qc = useQueryClient();
  const setFn = useServerFn(setBrandFeature);
  const [notes, setNotes] = React.useState<string>(feature.notes ?? "");

  const m = useMutation({
    mutationFn: (vars: { enabled: boolean; notes?: string | null }) =>
      setFn({
        data: {
          brandId,
          featureKey: feature.key,
          enabled: vars.enabled,
          notes: vars.notes ?? notes,
        },
      }),
    onSuccess: (_r, vars) => {
      toast.success(`${feature.name}: ${vars.enabled ? "habilitado" : "desabilitado"}`);
      qc.invalidateQueries({ queryKey: ["brand-features", brandId, "sa"] });
      qc.invalidateQueries({ queryKey: ["brand-features", brandId] });
      qc.invalidateQueries({ queryKey: ["sa-brands"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card className={cn("transition-colors", feature.enabled && "border-primary/40")}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div className="min-w-0">
          <CardTitle className="text-base flex items-center gap-2">
            {feature.name}
            {feature.is_core ? (
              <Badge variant="outline" className="uppercase text-[10px]">
                Core
              </Badge>
            ) : null}
          </CardTitle>
          {feature.description ? (
            <p className="mt-1 text-xs text-muted-foreground">{feature.description}</p>
          ) : null}
        </div>
        <Switch
          checked={feature.enabled}
          disabled={feature.is_core || m.isPending}
          onCheckedChange={(v) => m.mutate({ enabled: v })}
          className="data-[state=checked]:bg-primary"
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {feature.enabled_at ? (
          <p className="text-[11px] text-muted-foreground">
            Habilitado em{" "}
            {format(new Date(feature.enabled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            {feature.enabled_by ? ` por ${feature.enabled_by.slice(0, 8)}` : ""}
          </p>
        ) : feature.is_core ? (
          <p className="text-[11px] text-muted-foreground">Módulo Core — sempre ativo.</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">Não vendido para esta marca.</p>
        )}
        {!feature.is_core ? (
          <div className="space-y-2">
            <Textarea
              placeholder="Observações internas (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="text-xs"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={m.isPending || notes === (feature.notes ?? "")}
              onClick={() => m.mutate({ enabled: feature.enabled, notes })}
            >
              Salvar observação
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
