import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Crown, Info, Layers, Loader2, Minus, ShieldCheck, Users } from "lucide-react";

import { listBrandTeam } from "@/lib/team.functions";
import {
  ALL_PERMISSION_IDS,
  PERMISSION_GROUPS,
  ROLE_DEFAULT_PERMISSIONS,
  type PermissionId,
} from "@/lib/permissions";
import { useActiveContext } from "@/hooks/use-active-context";
import { usePageHeader } from "@/hooks/use-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageKpi, PageKpiGrid } from "@/components/ui/page-kpi";

export const Route = createFileRoute("/_authenticated/settings/permissions")({
  component: PermissionsPage,
});

/** Papéis reais de `brand_members.role` (enum app_role). */
type RoleKey = keyof typeof ROLE_DEFAULT_PERMISSIONS | "client";

const ROLES: Array<{ key: RoleKey; label: string; description: string; badge: string; icon: typeof Crown }> = [
  { key: "owner", label: "Proprietário", description: "Administra a marca por completo.", badge: "Admin", icon: Crown },
  { key: "manager", label: "Gerente", description: "Administra equipe, clientes, marca e integrações.", badge: "Admin", icon: ShieldCheck },
  { key: "editor", label: "Editor", description: "Opera conteúdo e produção dentro do escopo dele.", badge: "Colaborador", icon: Layers },
  { key: "designer", label: "Designer", description: "Produz criativos no fluxo de conteúdo.", badge: "Colaborador", icon: Layers },
  { key: "client", label: "Cliente", description: "Acesso somente ao portal do cliente, sem área interna.", badge: "Portal", icon: Users },
];

/** Permissões concedidas por padrão a cada papel (fonte: src/lib/permissions.ts). */
function defaultsFor(role: RoleKey): PermissionId[] {
  if (role === "client") return [];
  return ROLE_DEFAULT_PERMISSIONS[role] ?? [];
}

function grants(perms: readonly PermissionId[], id: PermissionId) {
  return perms.includes("admin.full") || perms.includes(id);
}

function PermissionsPage() {
  const { brandId } = useActiveContext();
  usePageHeader({ title: "Permissões", subtitle: "Papéis reais da marca e permissões efetivas" });

  const load = useServerFn(listBrandTeam);
  const teamQ = useQuery({
    queryKey: ["brand-team", brandId],
    queryFn: () => load({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  const members = teamQ.data?.members ?? [];

  const stats = useMemo(() => {
    const admins = members.filter((m) => m.role === "owner" || m.role === "manager").length;
    const full = members.filter((m) => m.permissions.includes("admin.full")).length;
    const noPerms = members.filter(
      (m) => m.role !== "client" && m.permissions.length === 0,
    ).length;
    return { total: members.length, admins, full, noPerms };
  }, [members]);

  return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <p className="font-medium">Como o acesso é decidido hoje</p>
          <p className="text-muted-foreground">
            O papel em <code className="text-xs">brand_members.role</code> define o nível de acesso da
            marca (owner e manager administram; editor e designer são colaboradores; cliente usa apenas
            o portal). As permissões abaixo são o conjunto real do sistema e são atribuídas por membro
            na aba <strong>Equipe &amp; Acesso</strong> — esta tela não cria capacidades novas.
          </p>
        </div>
      </div>

      <PageKpiGrid>
        <PageKpi label="Membros" value={stats.total} icon={<Users className="h-4 w-4" />} />
        <PageKpi
          label="Administradores"
          value={stats.admins}
          icon={<ShieldCheck className="h-4 w-4" />}
          status={stats.admins === 0 ? "warning" : "info"}
          description="owner ou manager"
        />
        <PageKpi
          label="Com admin.full"
          value={stats.full}
          icon={<Crown className="h-4 w-4" />}
          status={stats.full > 0 ? "warning" : "neutral"}
          description="acesso irrestrito concedido"
        />
        <PageKpi
          label="Sem permissões"
          value={stats.noPerms}
          icon={<Minus className="h-4 w-4" />}
          status={stats.noPerms > 0 ? "warning" : "success"}
          description="colaboradores sem grants"
        />
      </PageKpiGrid>

      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">Papéis</TabsTrigger>
          <TabsTrigger value="matrix">Padrões por papel</TabsTrigger>
          <TabsTrigger value="members">Permissões efetivas</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {ROLES.map((r) => {
              const perms = defaultsFor(r.key);
              const count = members.filter((m) => m.role === r.key).length;
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
                      {count} {count === 1 ? "membro" : "membros"} · {perms.includes("admin.full")
                        ? "todas as permissões"
                        : `${perms.length} de ${ALL_PERMISSION_IDS.length} permissões por padrão`}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {perms.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Nenhuma permissão interna.</span>
                      ) : (
                        perms.map((p) => (
                          <Badge key={p} variant="outline" className="text-[10px] font-normal">
                            {p}
                          </Badge>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="matrix" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Padrão aplicado ao convidar alguém com cada papel. Pode ser personalizado por membro em
            Equipe &amp; Acesso.
          </p>
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
                  {PERMISSION_GROUPS.map((g) => (
                    <Fragment key={g.id}>
                      <tr className="bg-muted/20">
                        <td colSpan={ROLES.length + 1} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {g.label}
                        </td>
                      </tr>
                      {g.items.map((item) => (
                        <tr key={item.id} className="border-b border-border/40 last:border-b-0">
                          <td className="px-4 py-2 align-top">
                            <div className="font-medium">{item.label}</div>
                            <div className="text-xs text-muted-foreground">{item.description}</div>
                            <code className="text-[10px] text-muted-foreground/80">{item.id}</code>
                          </td>
                          {ROLES.map((r) => {
                            const on = grants(defaultsFor(r.key), item.id);
                            return (
                              <td key={r.key} className="px-3 py-2 text-center">
                                {on ? (
                                  <Check className="mx-auto h-4 w-4 text-health-good" />
                                ) : (
                                  <Minus className="mx-auto h-3.5 w-3.5 text-muted-foreground/50" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="members" className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Permissões realmente gravadas em cada membro desta marca.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/settings/team">Editar em Equipe &amp; Acesso</Link>
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {!brandId ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Selecione uma marca no menu lateral.
                </div>
              ) : teamQ.isLoading ? (
                <div className="flex items-center justify-center p-10">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : members.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Nenhum membro nesta marca.</div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {members.map((m) => (
                    <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-[200px] flex-1">
                        <div className="text-sm font-medium">{m.full_name || m.email || m.user_id}</div>
                        <div className="text-xs text-muted-foreground">{m.email ?? "—"}</div>
                      </div>
                      <Badge variant="secondary" className="text-[10px] uppercase">{m.role}</Badge>
                      <div className="flex flex-1 flex-wrap justify-end gap-1">
                        {m.permissions.length === 0 ? (
                          <span className="text-xs text-muted-foreground">sem permissões</span>
                        ) : (
                          m.permissions.map((p) => (
                            <Badge key={p} variant="outline" className="text-[10px] font-normal">{p}</Badge>
                          ))
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
