import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, Crown, Layers, Minus, Plus, ShieldCheck, Users } from "lucide-react";
import { usePageHeader } from "@/hooks/use-page-header";

export const Route = createFileRoute("/_authenticated/settings/permissions")({
  component: PermissionsPage,
});

type RoleKey = "owner" | "manager" | "editor" | "designer" | "client";

const ROLES: Array<{ key: RoleKey; label: string; description: string; badge: string; icon: typeof Crown }> = [
  { key: "owner", label: "Proprietário", description: "Dono da marca — acesso total, inclusive faturamento.", badge: "Sistema", icon: Crown },
  { key: "manager", label: "Gerente", description: "Administra equipe, clientes, marca e integrações.", badge: "Sistema", icon: ShieldCheck },
  { key: "editor", label: "Editor", description: "Cria e edita conteúdo, planeja e aprova internamente.", badge: "Sistema", icon: Layers },
  { key: "designer", label: "Designer", description: "Produz criativos e mídias dentro do fluxo de conteúdo.", badge: "Sistema", icon: Layers },
  { key: "client", label: "Cliente", description: "Acesso somente-leitura ao portal do cliente.", badge: "Portal", icon: Users },
];

type Cap = { id: string; label: string; description: string };
type Group = { id: string; label: string; caps: Cap[] };

const GROUPS: Group[] = [
  {
    id: "general",
    label: "Geral",
    caps: [
      { id: "sidebar.full", label: "Acesso completo à navegação", description: "Todas as áreas da sidebar (Analytics, Integrações, Agentes IA)." },
      { id: "billing.view", label: "Faturamento e plano", description: "Ver e alterar a assinatura da marca." },
    ],
  },
  {
    id: "team",
    label: "Equipe",
    caps: [
      { id: "team.invite", label: "Convidar membros", description: "Enviar convites e provisionar novos usuários." },
      { id: "team.roles", label: "Alterar funções", description: "Trocar o papel de outros membros da equipe." },
    ],
  },
  {
    id: "content",
    label: "Conteúdo & Produção",
    caps: [
      { id: "content.create", label: "Criar cards", description: "Adicionar novos itens ao pipeline de produção." },
      { id: "content.approve", label: "Aprovar internamente", description: "Marcar cards como aprovados na etapa interna." },
      { id: "content.publish", label: "Publicar", description: "Disparar publicações nos canais conectados." },
    ],
  },
  {
    id: "customers",
    label: "Clientes",
    caps: [
      { id: "customers.edit", label: "Editar dados básicos", description: "Contato, e-mail, redes e informações principais." },
      { id: "customers.delete", label: "Excluir clientes", description: "Remover um cliente da marca." },
    ],
  },
  {
    id: "media",
    label: "Mídia paga",
    caps: [
      { id: "media.plans", label: "Criar planos de mídia", description: "Novos planos, orçamentos e distribuição." },
      { id: "media.publish", label: "Publicar planos", description: "Compartilhar planos publicamente com o cliente." },
    ],
  },
  {
    id: "ai",
    label: "IA & Agentes",
    caps: [
      { id: "ai.edit", label: "Editar prompts e modelos", description: "Ajustar comportamento dos agentes de IA." },
      { id: "ai.usage", label: "Ver consumo de IA", description: "Painel de custo e uso por marca/cliente." },
    ],
  },
];

// Matriz declarativa (somente leitura por enquanto).
const MATRIX: Record<string, Record<RoleKey, boolean>> = {
  "sidebar.full":     { owner: true,  manager: true,  editor: false, designer: false, client: false },
  "billing.view":     { owner: true,  manager: true,  editor: false, designer: false, client: false },
  "team.invite":      { owner: true,  manager: true,  editor: false, designer: false, client: false },
  "team.roles":       { owner: true,  manager: true,  editor: false, designer: false, client: false },
  "content.create":   { owner: true,  manager: true,  editor: true,  designer: true,  client: false },
  "content.approve":  { owner: true,  manager: true,  editor: true,  designer: false, client: false },
  "content.publish":  { owner: true,  manager: true,  editor: true,  designer: false, client: false },
  "customers.edit":   { owner: true,  manager: true,  editor: false, designer: false, client: false },
  "customers.delete": { owner: true,  manager: false, editor: false, designer: false, client: false },
  "media.plans":      { owner: true,  manager: true,  editor: true,  designer: false, client: false },
  "media.publish":    { owner: true,  manager: true,  editor: false, designer: false, client: false },
  "ai.edit":          { owner: true,  manager: true,  editor: false, designer: false, client: false },
  "ai.usage":         { owner: true,  manager: true,  editor: false, designer: false, client: false },
};

function PermissionsPage() {
  usePageHeader({ title: "Permissões", subtitle: "Funções do sistema e matriz de acesso" });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">Funções</TabsTrigger>
          <TabsTrigger value="matrix">Matriz de Permissões</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Funções do sistema</h2>
              <p className="text-xs text-muted-foreground">Papéis pré-configurados atribuídos aos membros da marca.</p>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" disabled variant="outline">
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Nova função
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Em breve — funções customizadas.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {ROLES.map((r) => {
              const enabled = GROUPS.flatMap((g) => g.caps).filter((c) => MATRIX[c.id]?.[r.key]);
              const Icon = r.icon;
              return (
                <Card key={r.key}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="rounded-md bg-muted p-1.5">
                          <Icon className="h-4 w-4 text-foreground" />
                        </div>
                        <div>
                          <CardTitle className="text-sm">{r.label}</CardTitle>
                          <CardDescription className="text-xs">{r.description}</CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-[10px] uppercase">{r.badge}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      {enabled.length} de {Object.keys(MATRIX).length} permissões
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {enabled.slice(0, 6).map((c) => (
                        <Badge key={c.id} variant="outline" className="text-[10px] font-normal">
                          {c.label}
                        </Badge>
                      ))}
                      {enabled.length > 6 ? (
                        <Badge variant="outline" className="text-[10px] font-normal">+{enabled.length - 6}</Badge>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="matrix" className="mt-4 space-y-6">
          <div className="rounded-lg border border-border/60 bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30 text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Permissão</th>
                    {ROLES.map((r) => (
                      <th key={r.key} className="px-3 py-2 text-center font-medium">{r.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GROUPS.map((g) => (
                    <>
                      <tr key={`h-${g.id}`} className="bg-muted/20">
                        <td colSpan={ROLES.length + 1} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {g.label}
                        </td>
                      </tr>
                      {g.caps.map((c) => (
                        <tr key={c.id} className="border-b border-border/40 last:border-b-0">
                          <td className="px-4 py-2 align-top">
                            <div className="font-medium">{c.label}</div>
                            <div className="text-xs text-muted-foreground">{c.description}</div>
                          </td>
                          {ROLES.map((r) => {
                            const on = MATRIX[c.id]?.[r.key] ?? false;
                            return (
                              <td key={r.key} className="px-3 py-2 text-center">
                                {on ? (
                                  <Check className="mx-auto h-4 w-4 text-emerald-500" />
                                ) : (
                                  <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
            Proprietário e Gerente têm acesso total — permissões abaixo são de referência e não podem ser editadas nesta versão.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}