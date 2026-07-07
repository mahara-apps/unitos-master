import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useActiveContext } from "@/hooks/use-active-context";
import { searchWorkspace } from "@/lib/dashboard.functions";
import { listClients } from "@/lib/workspace.functions";
import { LayoutDashboard, ListChecks, Calendar, FolderKanban, Users } from "lucide-react";

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { brandId, setClientId } = useActiveContext();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const search = useServerFn(searchWorkspace);
  const clientsFn = useServerFn(listClients);
  const clientsQ = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => clientsFn({ data: { brandId: brandId! } }),
    enabled: !!brandId && open,
  });
  const searchQ = useQuery({
    queryKey: ["search", brandId, q],
    queryFn: () => search({ data: { brandId: brandId!, q } }),
    enabled: !!brandId && q.trim().length >= 2,
  });

  function go(to: string) {
    setOpen(false);
    navigate({ to });
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar clientes, projetos, tarefas, posts…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        <CommandGroup heading="Navegação">
          <CommandItem onSelect={() => go("/app/dashboard")}><LayoutDashboard /> Dashboard <CommandShortcut>G D</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => go("/app/work")}><ListChecks /> Trabalho <CommandShortcut>G W</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => go("/app/calendar")}><Calendar /> Calendário <CommandShortcut>G C</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => go("/app/projects")}><FolderKanban /> Projetos</CommandItem>
          <CommandItem onSelect={() => go("/app/clients")}><Users /> Clientes</CommandItem>
        </CommandGroup>
        {clientsQ.data && clientsQ.data.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Trocar cliente ativo">
              <CommandItem onSelect={() => { setClientId(null); setOpen(false); }}>
                Toda a agência
              </CommandItem>
              {clientsQ.data.map((c) => (
                <CommandItem key={c.id} onSelect={() => { setClientId(c.id); setOpen(false); }}>
                  <div className="h-2 w-2 rounded-full" style={{ background: c.color ?? "#6366f1" }} /> {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {searchQ.data && q.trim().length >= 2 && (
          <>
            <CommandSeparator />
            {searchQ.data.clients.length > 0 && (
              <CommandGroup heading="Clientes">
                {searchQ.data.clients.map((c) => (
                  <CommandItem key={c.id} onSelect={() => { setClientId(c.id); go("/app/dashboard"); }}>{c.name}</CommandItem>
                ))}
              </CommandGroup>
            )}
            {searchQ.data.tasks.length > 0 && (
              <CommandGroup heading="Tarefas">
                {searchQ.data.tasks.map((t) => (
                  <CommandItem key={t.id} onSelect={() => go("/app/work")}>{t.title}</CommandItem>
                ))}
              </CommandGroup>
            )}
            {searchQ.data.posts.length > 0 && (
              <CommandGroup heading="Posts">
                {searchQ.data.posts.map((p) => (
                  <CommandItem key={p.id} onSelect={() => go("/app/calendar")}>{p.title}</CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}