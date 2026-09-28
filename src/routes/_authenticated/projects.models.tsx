import { createFileRoute, Link, Outlet, useBlocker, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowDown, ArrowUp, Archive, Copy, Plus, Trash2, MoreHorizontal, RotateCcw, Search, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveContext } from "@/hooks/use-active-context";
import { usePageHeader } from "@/hooks/use-page-header";
import { DashboardPageShell } from "@/components/ui/dashboard-primitives";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { listProjects } from "@/lib/projects.functions";
import { listTemplatesFn, saveTemplateFn, archiveTemplateFn, restoreTemplateFn, deleteTemplateFn, canManageTemplatesFn, captureProjectTemplateFn, type ProjectTemplate } from "@/lib/project-templates.functions";

type Task = { title: string; description: string | null; priority: "low" | "medium" | "high" | "urgent"; estimatedMinutes: number | null; assigneeId: string | null };
type Job = { name: string; description: string | null; color: string | null; estimatedMinutes: number | null; assigneeId: string | null; tasks: Task[] };
type Text = { level: "project" | "job" | "task"; kind: "description" | "comment"; body: string; jobIndex?: number; taskIndex?: number; sourceId?: string; sourceKind?: "work_comment" | "task_comment" | "client_briefing" | "brand_briefing" };
type Blueprint = { description: string | null; ownerId: string | null; participants: string[]; texts: Text[]; jobs: Job[]; directTasks: Task[] };
const emptyBlueprint = (): Blueprint => ({ description: null, ownerId: null, participants: [], texts: [], jobs: [], directTasks: [] });
const emptyJob = (): Job => ({ name: "", description: null, color: null, estimatedMinutes: null, assigneeId: null, tasks: [] });
const emptyTask = (): Task => ({ title: "", description: null, priority: "medium", estimatedMinutes: null, assigneeId: null });

export const Route = createFileRoute("/_authenticated/projects/models")({
  head: () => ({ meta: [
    { title: "Modelos de projeto | Unitos" },
    { name: "description", content: "Crie e gerencie modelos reutilizáveis de projetos." },
    { property: "og:title", content: "Modelos de projeto | Unitos" },
    { property: "og:description", content: "Crie e gerencie modelos reutilizáveis de projetos." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <Outlet />,
});

export function ProjectModelsPage({ mode = "list", initialTemplateId }: { mode?: "list" | "new" | "edit"; initialTemplateId?: string }) {
  const navigate = useNavigate();
  const leavingAfterSave = useRef(false);
  const { brandId } = useActiveContext();
  const qc = useQueryClient();
  const list = useServerFn(listTemplatesFn);
  const projectsFn = useServerFn(listProjects);
  const captureFn = useServerFn(captureProjectTemplateFn);
  const saveFn = useServerFn(saveTemplateFn);
  const archiveFn = useServerFn(archiveTemplateFn);
  const restoreFn = useServerFn(restoreTemplateFn);
  const deleteFn = useServerFn(deleteTemplateFn);
  const permissionFn = useServerFn(canManageTemplatesFn);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"active" | "archived" | "system">("active");
  const [confirmDelete, setConfirmDelete] = useState<ProjectTemplate | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(mode !== "list");
  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId ?? null);
  const [sourceProjectId, setSourceProjectId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [blueprint, setBlueprint] = useState<Blueprint>(emptyBlueprint);
  const [candidates, setCandidates] = useState<Array<{ id: string; sourceKind: Text["sourceKind"]; body: string; level: Text["level"]; jobIndex?: number; taskIndex?: number; selected: boolean }>>([]);
  const [truncated, setTruncated] = useState(false);
  usePageHeader({ title: "Modelos de projeto", subtitle: "Estruturas reutilizáveis para novos projetos." }, []);
  const templatesQ = useQuery({ queryKey: ["project-templates", brandId], queryFn: () => list({ data: { brandId: brandId ?? "", includeArchived: true } }), enabled: !!brandId });
  const permissionQ = useQuery({ queryKey: ["manage-project-templates", brandId], queryFn: () => permissionFn({ data: { brandId: brandId ?? "" } }), enabled: !!brandId });
  useUnsavedGuard(editing && dirty);
  useBlocker({ shouldBlockFn: () => editing && dirty && !leavingAfterSave.current && !window.confirm("Descartar alterações não salvas?"), enableBeforeUnload: false });
  const projectsQ = useQuery({ queryKey: ["template-source-projects", brandId], queryFn: () => projectsFn({ data: { brandId: brandId ?? "" } }), enabled: !!brandId && editing && permissionQ.data === true });
    const save = useMutation({ mutationFn: () => saveFn({ data: { brandId: brandId ?? "", templateId, sourceProjectId, name, description: description || null, blueprint: { ...blueprint, texts: [...blueprint.texts, ...candidates.filter(c => c.selected).map(c => ({ level: c.level, kind: "comment" as const, body: c.body, jobIndex: c.jobIndex, taskIndex: c.taskIndex, sourceId: c.id, sourceKind: c.sourceKind }))] } } }), onSuccess: () => { toast.success("Modelo salvo"); leavingAfterSave.current = true; setDirty(false); setEditing(false); qc.invalidateQueries({ queryKey: ["project-templates", brandId] }); void navigate({ to: "/projects/models" }); }, onError: (e: Error) => toast.error(e.message) });
   const capture = useMutation({ mutationFn: (projectId: string) => captureFn({ data: { brandId: brandId ?? "", projectId } }), onSuccess: ({ project, blueprint: captured, candidates: sourceTexts, truncated: limited }) => { setSourceProjectId(project.id); setName(project.name); setBlueprint({ ...captured, directTasks: captured.directTasks ?? [] } as Blueprint); setTruncated(limited); setCandidates(sourceTexts.filter(c => c.level !== "job" || ("jobIndex" in c && (c.jobIndex ?? -1) >= 0)).filter(c => c.level !== "task" || ("taskIndex" in c && (c.taskIndex ?? -1) >= 0)).map(c => ({ ...c, selected: false }))); setDirty(true); }, onError: (e: Error) => toast.error(e.message) });
  const archive = useMutation({ mutationFn: (id: string) => archiveFn({ data: { brandId: brandId ?? "", templateId: id } }), onSuccess: () => { toast.success("Modelo arquivado"); qc.invalidateQueries({ queryKey: ["project-templates", brandId] }); }, onError: (e: Error) => toast.error(e.message) });
   const restore = useMutation({ mutationFn: (id: string) => restoreFn({ data: { brandId: brandId ?? "", templateId: id } }), onSuccess: () => { toast.success("Modelo restaurado"); qc.invalidateQueries({ queryKey: ["project-templates", brandId] }); }, onError: (e: Error) => toast.error(e.message) });
   const remove = useMutation({ mutationFn: () => deleteFn({ data: { brandId: brandId ?? "", templateId: confirmDelete?.id ?? "", confirmation } }), onSuccess: () => { toast.success("Modelo excluído"); setConfirmDelete(null); setConfirmation(""); qc.invalidateQueries({ queryKey: ["project-templates", brandId] }); }, onError: (e: Error) => toast.error(e.message) });
    const closeEditor = () => { if (dirty && !window.confirm("Descartar alterações não salvas?")) return; leavingAfterSave.current = true; setDirty(false); void navigate({ to: "/projects/models" }); };
    const openTemplate = (t: ProjectTemplate, duplicate = false) => { setTemplateId(duplicate ? null : t.id); setSourceProjectId(null); setName(duplicate ? `Cópia de ${t.name}` : t.name); setDescription(t.description ?? ""); setBlueprint(t.blueprint && typeof t.blueprint === "object" && !Array.isArray(t.blueprint) ? { ...emptyBlueprint(), ...t.blueprint as Blueprint, texts: ((t.blueprint as Blueprint).texts ?? []).map(({ sourceId, sourceKind, ...text }) => text) } : emptyBlueprint()); setCandidates([]); setTruncated(false); setDirty(duplicate); setEditing(true); };
   useEffect(() => {
     if (mode !== "edit" || !initialTemplateId || !templatesQ.data || permissionQ.data !== true) return;
     const template = templatesQ.data.find(t => t.id === initialTemplateId && !t.is_system && !t.archived_at);
     if (template && name === "") openTemplate(template);
   }, [mode, initialTemplateId, templatesQ.data, permissionQ.data]);
   useEffect(() => {
     if (mode !== "new" || !templatesQ.data || permissionQ.data !== true) return;
     const raw = sessionStorage.getItem("project-template-copy");
     if (!raw) return;
     sessionStorage.removeItem("project-template-copy");
     try {
       const candidate = JSON.parse(raw) as ProjectTemplate;
       const source = templatesQ.data.find(t => t.id === candidate.id);
       if (source) openTemplate(source, true);
     } catch { /* Ignore obsolete copy data. */ }
   }, [mode, templatesQ.data, permissionQ.data]);
   const updateJob = (index: number, patch: Partial<Job>) => { setDirty(true); setBlueprint(b => ({ ...b, jobs: b.jobs.map((j, i) => i === index ? { ...j, ...patch } : j) })); };
   const moveJob = (index: number, offset: number) => { setDirty(true); setBlueprint(b => { const jobs = [...b.jobs]; const target = index + offset; if (target < 0 || target >= jobs.length) return b; [jobs[index], jobs[target]] = [jobs[target], jobs[index]]; return { ...b, jobs, texts: b.texts.map(t => t.jobIndex === index ? { ...t, jobIndex: target } : t.jobIndex === target ? { ...t, jobIndex: index } : t) }; }); };
   const moveTask = (jobIndex: number, index: number, offset: number) => { setDirty(true); setBlueprint(b => { const jobs = [...b.jobs]; const job = jobs[jobIndex]; const tasks = [...job.tasks]; const target = index + offset; if (target < 0 || target >= tasks.length) return b; [tasks[index], tasks[target]] = [tasks[target], tasks[index]]; jobs[jobIndex] = { ...job, tasks }; return { ...b, jobs }; }); };
  if (!brandId) return <DashboardPageShell><p className="text-muted-foreground">Selecione um workspace.</p></DashboardPageShell>;
    const visible = (templatesQ.data ?? []).filter(t => filter === "system" ? t.is_system : filter === "archived" ? !t.is_system && !!t.archived_at : !t.is_system && !t.archived_at).filter(t => t.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")));
  return <DashboardPageShell>
    <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" asChild><Link to={editing ? "/projects/models" : "/projects"}><ArrowLeft className="mr-2 size-4" /> {editing ? "Modelos" : "Projetos"}</Link></Button>{!editing && permissionQ.data === true && <Button asChild><Link to="/projects/models/new"><Plus className="mr-2 size-4" /> Novo modelo</Link></Button>}</div>
    {!editing ? <div className="space-y-5">
      <div className="space-y-1"><h1 className="text-2xl font-semibold">Modelos de projeto</h1><p className="text-sm text-muted-foreground">Estruturas disponíveis neste workspace.</p></div>
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4"><div className="relative min-w-48 flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input aria-label="Buscar modelos" placeholder="Buscar modelos" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="flex gap-1" role="group" aria-label="Filtrar modelos">{([['active','Ativos'],['archived','Arquivados'],['system','Sistema']] as const).map(([key,label]) => <Button key={key} size="sm" variant={filter === key ? "secondary" : "ghost"} onClick={() => setFilter(key)}>{label}</Button>)}</div></div>
      {templatesQ.isPending && <p className="text-sm text-muted-foreground">Carregando modelos...</p>}
      {templatesQ.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar os modelos. <Button variant="link" onClick={() => templatesQ.refetch()}>Tentar novamente</Button></p>}
      {!templatesQ.isPending && !templatesQ.isError && visible.length === 0 && <div className="border-y border-border py-12 text-center text-sm text-muted-foreground"><Layers className="mx-auto mb-3 size-7"/><p>Nenhum modelo encontrado.</p></div>}
       {visible.map(t => <div key={t.id} className="flex items-center gap-4 border-b border-border py-4"><div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Layers className="size-4"/></div><div className="min-w-0 flex-1"><p className="truncate font-medium">{t.name}</p><p className="truncate text-sm text-muted-foreground">{t.description || "Sem descrição"}</p><p className="mt-1 text-xs text-muted-foreground">{t.source_client_id ? "Origem: cliente" : "Workspace"} · {t.jobs_count ?? 0} jobs · {t.tasks_count ?? 0} tarefas · {t.is_system ? "Sistema" : t.archived_at ? "Arquivado" : "Ativo"}{t.updated_at ? ` · Atualizado em ${new Date(t.updated_at).toLocaleDateString('pt-BR')}` : ''}</p></div>{permissionQ.data === true && <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Ações de ${t.name}`}><MoreHorizontal className="size-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{!t.is_system && !t.archived_at && <DropdownMenuItem onSelect={() => void navigate({ to: "/projects/models/$templateId", params: { templateId: t.id } })}>Editar</DropdownMenuItem>}<DropdownMenuItem onSelect={() => { sessionStorage.setItem("project-template-copy", JSON.stringify(t)); void navigate({ to: "/projects/models/new" }); }}><Copy/>Duplicar</DropdownMenuItem>{!t.is_system && (!t.archived_at ? <DropdownMenuItem disabled={archive.isPending} onSelect={() => { if (window.confirm(`Arquivar ${t.name}?`)) archive.mutate(t.id); }}><Archive/>Arquivar</DropdownMenuItem> : <DropdownMenuItem disabled={restore.isPending} onSelect={() => restore.mutate(t.id)}><RotateCcw/>Restaurar</DropdownMenuItem>)}{!t.is_system && <DropdownMenuItem className="text-destructive" onSelect={() => { setConfirmation(""); setConfirmDelete(t); }}><Trash2/>Excluir</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>}</div>)}
     </div> : permissionQ.isPending ? <p className="text-sm text-muted-foreground">Verificando permissões...</p> : permissionQ.data !== true ? <p role="alert" className="text-sm text-destructive">Você não tem permissão para editar modelos.</p> : mode === "edit" && !name && !templatesQ.isPending ? <p role="alert" className="text-sm text-destructive">Modelo indisponível para edição.</p> : <div className="max-w-4xl space-y-7" onChangeCapture={() => setDirty(true)}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background py-3"><h2 className="text-xl font-semibold">{templateId ? "Editar modelo" : "Novo modelo"}</h2><div className="flex gap-2"><Button variant="ghost" onClick={closeEditor}>Cancelar</Button><Button disabled={save.isPending || capture.isPending || name.trim().length < 2 || blueprint.directTasks.some(t => !t.title.trim()) || blueprint.jobs.some(j => !j.name.trim() || j.tasks.some(t => !t.title.trim()))} onClick={() => save.mutate()}>{save.isPending ? "Salvando..." : "Salvar"}</Button></div></div>
      {!templateId && <div className="space-y-2"><Label>Começar de um projeto existente (opcional)</Label><Select onValueChange={v => capture.mutate(v)}><SelectTrigger><SelectValue placeholder="Criar do zero ou escolher um projeto" /></SelectTrigger><SelectContent>{(projectsQ.data?.projects ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>{capture.isPending && <p className="text-sm text-muted-foreground">Carregando projeto...</p>}{projectsQ.isError && <p role="alert" className="text-sm text-destructive">Não foi possível listar projetos.</p>}</div>}
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Nome do modelo</Label><Input value={name} maxLength={120} onChange={e => setName(e.target.value)} /></div><div className="space-y-2"><Label>Descrição</Label><Input value={description} maxLength={4000} onChange={e => setDescription(e.target.value)} /></div></div>
      <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Jobs e tarefas</h3><Button variant="outline" size="sm" onClick={() => { setDirty(true); setBlueprint(b => ({ ...b, jobs: [...b.jobs, emptyJob()] })); }}><Plus className="mr-2 size-4" /> Job</Button></div>
        {blueprint.jobs.map((j, i) => <div key={i} className="space-y-3 border-b border-border py-4"><div className="flex items-center gap-2"><Input aria-label={`Nome do job ${i + 1}`} placeholder="Nome do job" value={j.name} onChange={e => updateJob(i, { name: e.target.value })} /><Button size="icon" variant="ghost" aria-label="Mover job para cima" disabled={i === 0} onClick={() => moveJob(i, -1)}><ArrowUp className="size-4" /></Button><Button size="icon" variant="ghost" aria-label="Mover job para baixo" disabled={i === blueprint.jobs.length - 1} onClick={() => moveJob(i, 1)}><ArrowDown className="size-4" /></Button><Button size="icon" variant="ghost" aria-label="Remover job" onClick={() => setBlueprint(b => ({ ...b, jobs: b.jobs.filter((_, n) => n !== i), texts: b.texts.filter(t => t.jobIndex !== i).map(t => t.jobIndex !== undefined && t.jobIndex > i ? { ...t, jobIndex: t.jobIndex - 1 } : t) }))}><Trash2 className="size-4" /></Button></div><Textarea aria-label={`Descrição do job ${i + 1}`} placeholder="Descrição padrão do job" value={j.description ?? ""} onChange={e => updateJob(i, { description: e.target.value })} /><Input type="number" min="0" className="max-w-40" aria-label="Minutos estimados do job" placeholder="Minutos estimados" value={j.estimatedMinutes ?? ""} onChange={e => updateJob(i, { estimatedMinutes: e.target.value ? Number(e.target.value) : null })} />
          <div className="space-y-2 pl-3 sm:pl-6">{j.tasks.map((task, k) => <div key={k} className="flex flex-wrap gap-2"><Input className="min-w-48 flex-1" aria-label={`Tarefa ${k + 1} do job ${i + 1}`} placeholder="Tarefa" value={task.title} onChange={e => updateJob(i, { tasks: j.tasks.map((t, n) => n === k ? { ...t, title: e.target.value } : t) })} /><Input className="w-32" type="number" min="0" aria-label={`Minutos estimados da tarefa ${k + 1}`} placeholder="Minutos" value={task.estimatedMinutes ?? ""} onChange={e => updateJob(i, { tasks: j.tasks.map((t, n) => n === k ? { ...t, estimatedMinutes: e.target.value ? Number(e.target.value) : null } : t) })} /><Button size="icon" variant="ghost" aria-label="Subir tarefa" disabled={k === 0} onClick={() => moveTask(i,k,-1)}><ArrowUp className="size-4" /></Button><Button size="icon" variant="ghost" aria-label="Descer tarefa" disabled={k === j.tasks.length-1} onClick={() => moveTask(i,k,1)}><ArrowDown className="size-4" /></Button><Button size="icon" variant="ghost" aria-label="Remover tarefa" onClick={() => updateJob(i, { tasks: j.tasks.filter((_, n) => n !== k) })}><Trash2 className="size-4" /></Button></div>)}<Button size="sm" variant="outline" onClick={() => updateJob(i, { tasks: [...j.tasks, emptyTask()] })}><Plus className="mr-2 size-4" /> Tarefa</Button></div>
        </div>)}
      </div>
       <section className="space-y-2"><div className="flex items-center justify-between"><h3 className="font-semibold">Tarefas diretas do projeto</h3><Button variant="outline" size="sm" onClick={() => { setDirty(true); setBlueprint(b => ({ ...b, directTasks: [...b.directTasks, emptyTask()] })); }}><Plus className="mr-2 size-4" /> Tarefa</Button></div>{blueprint.directTasks.map((t,i) => <div key={i} className="flex gap-2"><Input aria-label={`Tarefa direta ${i+1}`} value={t.title} onChange={e => setBlueprint(b => ({ ...b, directTasks: b.directTasks.map((item,n) => n===i ? {...item,title:e.target.value} : item) }))} /><Button variant="ghost" size="icon" aria-label="Remover tarefa direta" onClick={() => { setDirty(true); setBlueprint(b => ({ ...b, directTasks: b.directTasks.filter((_,n) => n!==i) })); }}><Trash2 className="size-4" /></Button></div>)}</section>
       {truncated && <p role="alert" className="text-sm text-destructive">O projeto ultrapassou o limite de itens capturados. Confira o modelo antes de salvar.</p>}
       {candidates.length > 0 && <section className="space-y-3"><h3 className="font-semibold">Textos do projeto original</h3><p className="text-sm text-muted-foreground">Selecione apenas os textos que devem virar conteúdo padrão. Nenhum vem selecionado.</p>{candidates.map((c, i) => <div key={`${c.sourceKind}-${c.id}-${i}`} className="flex gap-3 border-b border-border py-3"><input type="checkbox" aria-label={`Selecionar texto ${i+1}`} checked={c.selected} onChange={e => setCandidates(items => items.map((item, n) => n === i ? { ...item, selected: e.target.checked } : item))} /><div className="flex-1 space-y-2"><Select value={c.level === "project" ? "project" : c.level === "job" ? `job:${c.jobIndex}` : `task:${c.taskIndex}`} onValueChange={v => setCandidates(items => items.map((item,n) => n!==i ? item : v==="project" ? {...item,level:"project",jobIndex:undefined,taskIndex:undefined} : v.startsWith("job:") ? {...item,level:"job",jobIndex:Number(v.slice(4)),taskIndex:undefined} : {...item,level:"task",jobIndex:undefined,taskIndex:Number(v.slice(5))}))}><SelectTrigger aria-label={`Destino do texto ${i+1}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="project">Descrição do projeto</SelectItem>{blueprint.jobs.map((j,n) => <SelectItem key={`job:${n}`} value={`job:${n}`}>Job: {j.name || n+1}</SelectItem>)}{blueprint.jobs.flatMap((j,n) => j.tasks.map((t,k) => <SelectItem key={`task:${blueprint.jobs.slice(0,n).reduce((sum,job)=>sum+job.tasks.length,0)+k}`} value={`task:${blueprint.jobs.slice(0,n).reduce((sum,job)=>sum+job.tasks.length,0)+k}`}>Tarefa: {t.title || k+1}</SelectItem>))}{blueprint.directTasks.map((t,n) => <SelectItem key={`direct:${n}`} value={`task:${blueprint.jobs.reduce((sum,j)=>sum+j.tasks.length,0)+n}`}>Tarefa: {t.title || n+1}</SelectItem>)}</SelectContent></Select><Textarea aria-label={`Texto padrão ${i+1}`} value={c.body} onChange={e => setCandidates(items => items.map((item, n) => n === i ? { ...item, body: e.target.value } : item))} /></div></div>)}</section>}
        <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="outline" onClick={closeEditor}>Cancelar</Button><Button disabled={save.isPending || capture.isPending || name.trim().length < 2 || blueprint.directTasks.some(t => !t.title.trim()) || blueprint.jobs.some(j => !j.name.trim() || j.tasks.some(t => !t.title.trim()))} onClick={() => save.mutate()}>{save.isPending ? "Salvando..." : "Salvar modelo"}</Button></div>
    </div>}
     <AlertDialog open={!!confirmDelete} onOpenChange={open => { if (!open) { setConfirmDelete(null); setConfirmation(""); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir modelo?</AlertDialogTitle><AlertDialogDescription>O modelo será removido definitivamente. Projetos já criados permanecem intactos. Se ele possuir registros de criação, será necessário arquivá-lo.</AlertDialogDescription></AlertDialogHeader><Label htmlFor="confirm-model-name">Digite {confirmDelete?.name} para confirmar</Label><Input id="confirm-model-name" value={confirmation} onChange={e => setConfirmation(e.target.value)}/><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><Button variant="destructive" disabled={remove.isPending || confirmation !== confirmDelete?.name} onClick={() => remove.mutate()}>{remove.isPending ? "Excluindo..." : "Excluir modelo"}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </DashboardPageShell>;
}