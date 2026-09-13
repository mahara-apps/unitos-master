import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GitBranch, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addSubtaskFn, deleteSubtaskFn, listSubtasksFn, updateSubtaskFn } from "@/lib/tasks.functions";

export function TaskSubtasksPopover({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const list = useServerFn(listSubtasksFn); const add = useServerFn(addSubtaskFn); const update = useServerFn(updateSubtaskFn); const remove = useServerFn(deleteSubtaskFn);
  const key = ["task-subtasks", taskId];
  const query = useQuery({ queryKey: key, queryFn: () => list({ data: { taskId } }) });
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["job-tasks"] }); };
  const addMut = useMutation({ mutationFn: () => add({ data: { taskId, title: title.trim() } }), onSuccess: () => { setTitle(""); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const updateMut = useMutation({ mutationFn: ({ id, done }: { id: string; done: boolean }) => update({ data: { subtaskId: id, patch: { done } } }), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  const deleteMut = useMutation({ mutationFn: (id: string) => remove({ data: { subtaskId: id } }), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  const done = (query.data ?? []).filter((item) => item.done).length;
  return <Popover><PopoverTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Subtarefas" title="Subtarefas"><GitBranch className="h-3.5 w-3.5" /></Button></PopoverTrigger><PopoverContent align="end" className="w-80 p-0"><header className="border-b border-border/60 px-3 py-2.5 text-xs font-semibold">Subtarefas {query.data?.length ? `· ${done}/${query.data.length}` : ""}</header><div className="max-h-64 space-y-1 overflow-y-auto p-2">{(query.data ?? []).map((item) => <div key={item.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"><Checkbox checked={item.done} onCheckedChange={(checked) => updateMut.mutate({ id: item.id, done: checked === true })} /><span className={item.done ? "min-w-0 flex-1 truncate text-xs text-muted-foreground line-through" : "min-w-0 flex-1 truncate text-xs"}>{item.title}</span><Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Excluir subtarefa" onClick={() => deleteMut.mutate(item.id)}><Trash2 className="h-3 w-3" /></Button></div>)}{query.data?.length === 0 ? <p className="p-4 text-center text-xs text-muted-foreground">Nenhuma subtarefa.</p> : null}</div><div className="flex gap-2 border-t border-border/60 p-2"><Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) addMut.mutate(); }} placeholder="Nova subtarefa" className="h-8 text-xs" /><Button size="icon" className="h-8 w-8" aria-label="Adicionar subtarefa" disabled={!title.trim()} onClick={() => addMut.mutate()}><Plus className="h-3.5 w-3.5" /></Button></div></PopoverContent></Popover>;
}