import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ExpandedModal } from "@/components/ui/expanded-modal";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/modal-sandbox")({ component: Sandbox });

function Sandbox() {
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  const [sel, setSel] = useState("");
  const [pop, setPop] = useState(false);
  const [picked, setPicked] = useState("");
  return (
    <div className="p-10">
      <Button data-testid="open" onClick={() => setOpen(true)}>Abrir</Button>
      <p data-testid="behind">conteudo atras</p>
      <ExpandedModal
        open={open}
        onOpenChange={setOpen}
        title="Sandbox"
        description="smoke test"
        size="md"
        footer={<Button data-testid="footer-btn">Salvar</Button>}
      >
        <div className="space-y-4">
          <Select value={sel} onValueChange={setSel}>
            <SelectTrigger data-testid="select-trigger" className="w-60">
              <SelectValue placeholder="Escolher" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">Opcao A</SelectItem>
              <SelectItem value="b">Opcao B</SelectItem>
            </SelectContent>
          </Select>
          <p data-testid="select-value">sel={sel}</p>

          <Popover open={pop} onOpenChange={setPop} modal={false}>
            <PopoverTrigger asChild>
              <Button data-testid="pop-trigger" variant="outline">Buscar local</Button>
            </PopoverTrigger>
            <PopoverContent className="z-[70]">
              <button data-testid="pop-item" onClick={() => { setPicked("Sao Paulo"); setPop(false); }}>
                Sao Paulo
              </button>
            </PopoverContent>
          </Popover>
          <p data-testid="pop-value">pop={picked}</p>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button data-testid="alert-trigger" variant="ghost">Reset</Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="z-[70]">
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar?</AlertDialogTitle>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="alert-cancel">Cancelar</AlertDialogCancel>
                <AlertDialogAction data-testid="alert-ok">Ok</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button data-testid="open-nested" onClick={() => setNested(true)}>Abrir aninhado</Button>
          {Array.from({ length: 40 }).map((_, i) => (
            <p key={i} className="text-sm text-muted-foreground">linha longa {i}</p>
          ))}
        </div>
      </ExpandedModal>
      <ExpandedModal open={nested} onOpenChange={setNested} title="Aninhado" size="sm" nested>
        <p data-testid="nested-body">corpo aninhado</p>
      </ExpandedModal>
    </div>
  );
}
