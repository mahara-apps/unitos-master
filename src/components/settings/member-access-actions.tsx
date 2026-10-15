import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Loader2, Mail, Copy, RefreshCw } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { resendMemberAccessFn, setTemporaryPasswordFn } from "@/lib/member-access.functions";
import { generateTempPassword, TEMP_PASSWORD_MIN } from "@/lib/member-access";

type Props = { brandId: string; userId: string; email: string | null; name: string };

export function MemberAccessMenuItems({ onResend, onPassword }: { onResend: () => void; onPassword: () => void }) {
  return (
    <>
      <DropdownMenuItem onClick={onResend}>
        <Mail className="mr-2 h-3.5 w-3.5" /> Reenviar acesso por e-mail
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onPassword}>
        <KeyRound className="mr-2 h-3.5 w-3.5" /> Definir senha provisória
      </DropdownMenuItem>
    </>
  );
}

export function ResendAccessDialog({ open, onOpenChange, brandId, userId, email, name }: Props & { open: boolean; onOpenChange: (o: boolean) => void }) {
  const resend = useServerFn(resendMemberAccessFn);
  const mut = useMutation({
    mutationFn: () => resend({ data: { brandId, userId } }),
    onSuccess: (r) => { toast.success(`Acesso reenviado para ${r.email}.`); onOpenChange(false); },
    onError: (e: Error) => toast.error("Não foi possível reenviar o acesso", { description: e.message }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reenviar acesso por e-mail?</DialogTitle>
          <DialogDescription>
            <strong>{name}</strong> receberá em {email ?? "seu e-mail"} um link para definir a senha e entrar.
            A senha atual continua valendo até ser trocada.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TempPasswordDialog({ open, onOpenChange, brandId, userId, name }: Props & { open: boolean; onOpenChange: (o: boolean) => void }) {
  const setPw = useServerFn(setTemporaryPasswordFn);
  const [password, setPassword] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const valid = password.length >= TEMP_PASSWORD_MIN;
  const mut = useMutation({
    mutationFn: () => setPw({ data: { brandId, userId, password, sendEmail } }),
    onSuccess: (r) => {
      toast.success(r.emailed ? "Senha provisória definida e enviada por e-mail." : "Senha provisória definida. Repasse-a para a pessoa.");
      setPassword(""); setSendEmail(false); onOpenChange(false);
    },
    onError: (e: Error) => toast.error("Não foi possível definir a senha", { description: e.message }),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setPassword(""); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Definir senha provisória</DialogTitle>
          <DialogDescription>
            <strong>{name}</strong> usará esta senha para entrar e precisará criar uma nova no próximo acesso.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="temp-pw">Senha provisória</Label>
          <div className="flex gap-2">
            <Input id="temp-pw" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={`Mínimo ${TEMP_PASSWORD_MIN} caracteres`} />
            <Button type="button" variant="outline" size="icon" aria-label="Gerar senha" onClick={() => setPassword(generateTempPassword())}><RefreshCw className="h-4 w-4" /></Button>
            <Button type="button" variant="outline" size="icon" aria-label="Copiar senha" disabled={!password}
              onClick={() => navigator.clipboard.writeText(password).then(() => toast.success("Senha copiada."))}><Copy className="h-4 w-4" /></Button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(v === true)} />
            Enviar a senha por e-mail para a pessoa
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!valid || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Definir senha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
