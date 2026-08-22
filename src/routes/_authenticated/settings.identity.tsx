import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Building2,
  Loader2,
  MapPin,
  Palette,
  Save,
} from "lucide-react";

import { BrandingSlots } from "@/components/settings/branding-slots";
import { getBrandCompany, updateBrandCompany } from "@/lib/workspace.functions";
import { useActiveContext } from "@/hooks/use-active-context";
import { usePageHeader } from "@/hooks/use-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings/identity")({
  component: IdentityPage,
});

type CompanyState = {
  cpf: string;
  cnpj: string;
  nome_fantasia: string;
  razao_social: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
};

const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

function IdentityPage() {
  const { brandId } = useActiveContext();
  usePageHeader(
    { title: "Agência", subtitle: "Dados cadastrais e identidade visual da marca" },
    [],
  );

  if (!brandId) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6">
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Selecione um workspace no menu lateral para editar a identidade da marca.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <Tabs defaultValue="visual" className="w-full">
        <TabsList>
          <TabsTrigger value="visual">Identidade visual</TabsTrigger>
          <TabsTrigger value="company">Dados da empresa</TabsTrigger>
          <TabsTrigger value="address">Endereço</TabsTrigger>
        </TabsList>

        <TabsContent value="visual" className="mt-4 space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
            <Palette className="mt-0.5 h-5 w-5 text-primary" />
            <div className="text-sm">
              <p className="font-medium">Identidade visual desta marca</p>
              <p className="text-muted-foreground">
                Visualização apenas. A troca de logos e ícone é feita pelo Super Admin em
                Administração do Cliente → Identidade.
              </p>
            </div>
          </div>
          <BrandingSlots brandId={brandId} editable={false} />
        </TabsContent>


        <TabsContent value="company" className="mt-4">
          <CompanyPanel brandId={brandId} section="company" />
        </TabsContent>
        <TabsContent value="address" className="mt-4">
          <CompanyPanel brandId={brandId} section="address" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CompanyPanel({ brandId, section }: { brandId: string; section: "company" | "address" }) {
  const qc = useQueryClient();
  const fetchCompany = useServerFn(getBrandCompany);
  const saveCompany = useServerFn(updateBrandCompany);
  const [company, setCompany] = useState<CompanyState | null>(null);

  const companyQ = useQuery({
    queryKey: ["brand", "company", brandId],
    queryFn: () => fetchCompany({ data: { brandId } }),
  });

  useEffect(() => {
    if (companyQ.data && !company) {
      const c = companyQ.data;
      setCompany({
        cpf: c.cpf ?? "",
        cnpj: c.cnpj ?? "",
        nome_fantasia: c.nome_fantasia ?? "",
        razao_social: c.razao_social ?? "",
        cep: c.cep ?? "",
        rua: c.rua ?? "",
        numero: c.numero ?? "",
        complemento: c.complemento ?? "",
        bairro: c.bairro ?? "",
        cidade: c.cidade ?? "",
        estado: c.estado ?? "",
      });
    }
  }, [companyQ.data, company]);

  const companyMutation = useMutation({
    mutationFn: async (payload: CompanyState) =>
      saveCompany({
        data: {
          brandId,
          cpf: payload.cpf.trim() || null,
          cnpj: payload.cnpj.trim() || null,
          nome_fantasia: payload.nome_fantasia.trim() || null,
          razao_social: payload.razao_social.trim() || null,
          cep: payload.cep.trim() || null,
          rua: payload.rua.trim() || null,
          numero: payload.numero.trim() || null,
          complemento: payload.complemento.trim() || null,
          bairro: payload.bairro.trim() || null,
          cidade: payload.cidade.trim() || null,
          estado: payload.estado.trim().toUpperCase() || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Dados da marca atualizados");
      await qc.invalidateQueries({ queryKey: ["brand", "company", brandId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha ao salvar dados da marca"),
  });

  if (!company) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (section === "company") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            Dados da empresa
          </CardTitle>
          <CardDescription>Documentos e razão social da marca ativa.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cpf">CPF</Label>
            <Input
              id="cpf"
              value={company.cpf}
              onChange={(e) => setCompany({ ...company, cpf: e.target.value })}
              maxLength={20}
              placeholder="000.000.000-00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input
              id="cnpj"
              value={company.cnpj}
              onChange={(e) => setCompany({ ...company, cnpj: e.target.value })}
              maxLength={20}
              placeholder="00.000.000/0000-00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nome_fantasia">Nome fantasia</Label>
            <Input
              id="nome_fantasia"
              value={company.nome_fantasia}
              onChange={(e) => setCompany({ ...company, nome_fantasia: e.target.value })}
              maxLength={160}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="razao_social">Razão social</Label>
            <Input
              id="razao_social"
              value={company.razao_social}
              onChange={(e) => setCompany({ ...company, razao_social: e.target.value })}
              maxLength={200}
            />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button
              onClick={() => companyMutation.mutate(company)}
              disabled={companyMutation.isPending}
            >
              {companyMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar dados da empresa
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-primary" />
          Endereço
        </CardTitle>
        <CardDescription>Endereço fiscal e de correspondência da empresa.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-6">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="cep">CEP</Label>
          <Input
            id="cep"
            value={company.cep}
            onChange={(e) => setCompany({ ...company, cep: e.target.value })}
            maxLength={12}
            placeholder="00000-000"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-4">
          <Label htmlFor="rua">Rua</Label>
          <Input
            id="rua"
            value={company.rua}
            onChange={(e) => setCompany({ ...company, rua: e.target.value })}
            maxLength={200}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="numero">Número</Label>
          <Input
            id="numero"
            value={company.numero}
            onChange={(e) => setCompany({ ...company, numero: e.target.value })}
            maxLength={20}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-4">
          <Label htmlFor="complemento">Complemento</Label>
          <Input
            id="complemento"
            value={company.complemento}
            onChange={(e) => setCompany({ ...company, complemento: e.target.value })}
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="bairro">Bairro</Label>
          <Input
            id="bairro"
            value={company.bairro}
            onChange={(e) => setCompany({ ...company, bairro: e.target.value })}
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="cidade">Cidade</Label>
          <Input
            id="cidade"
            value={company.cidade}
            onChange={(e) => setCompany({ ...company, cidade: e.target.value })}
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor="estado">UF</Label>
          <Select
            value={company.estado || undefined}
            onValueChange={(v) => setCompany({ ...company, estado: v })}
          >
            <SelectTrigger id="estado">
              <SelectValue placeholder="UF" />
            </SelectTrigger>
            <SelectContent>
              {UFS.map((uf) => (
                <SelectItem key={uf} value={uf}>
                  {uf}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end sm:col-span-6">
          <Button
            onClick={() => companyMutation.mutate(company)}
            disabled={companyMutation.isPending}
          >
            {companyMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar endereço
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
