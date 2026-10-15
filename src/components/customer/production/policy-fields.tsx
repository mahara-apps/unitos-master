// Campos compartilhados das regras de produção (cliente e padrão do workspace).
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  APPROVAL_STAGES,
  APPROVAL_STAGE_LABEL,
  SCOPE_FRONTS,
  SCOPE_FRONT_LABEL,
  type ApprovalPolicy,
  type ApprovalStage,
  type ScopeFront,
  type ScopePolicy,
} from "@/lib/client-policy";

const STAGE_HINT: Record<ApprovalStage, string> = {
  plan: "Pauta do mês enviada para o cliente aprovar antes de produzir.",
  content: "Peça pronta enviada para o cliente aprovar antes de publicar.",
  schedule: "Datas sugeridas confirmadas pelo cliente antes de reservar.",
};

export function ApprovalFields({
  approval,
  onChange,
  disabled,
  pending,
}: {
  approval: ApprovalPolicy;
  onChange: (next: ApprovalPolicy) => void;
  disabled: boolean;
  pending?: Partial<Record<ApprovalStage, number>>;
}) {
  return (
    <div className="space-y-3">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        Aprovação do cliente
      </Label>
      {APPROVAL_STAGES.map((stage) => (
        <div
          key={stage}
          className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-3"
        >
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{APPROVAL_STAGE_LABEL[stage]}</span>
              <Badge variant="outline">
                {approval[stage] === "internal" ? "Time avança direto" : "Cliente aprova"}
              </Badge>
              {(pending?.[stage] ?? 0) > 0 && (
                <Badge variant="secondary">{pending?.[stage]} aguardando</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{STAGE_HINT[stage]}</p>
          </div>
          <Switch
            aria-label={`Exigir aprovação do cliente em ${APPROVAL_STAGE_LABEL[stage]}`}
            checked={approval[stage] === "client"}
            disabled={disabled}
            onCheckedChange={(v) => onChange({ ...approval, [stage]: v ? "client" : "internal" })}
          />
        </div>
      ))}
    </div>
  );
}

export function ScopeFields({
  scope,
  onChange,
  disabled,
}: {
  scope: ScopePolicy;
  onChange: (next: ScopePolicy) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        Limite de produção
      </Label>
      <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-3">
        <div className="space-y-1">
          <span className="text-sm font-medium">Bloquear ao passar do contrato</span>
          <p className="text-xs text-muted-foreground">
            Desligado, o excedente só gera aviso e fica registrado no histórico.
          </p>
        </div>
        <Switch
          aria-label="Bloquear ao passar do contrato"
          checked={scope.mode === "block"}
          disabled={disabled}
          onCheckedChange={(v) => onChange({ ...scope, mode: v ? "block" : "warn" })}
        />
      </div>
      <div className="rounded-lg border border-border/60 p-3">
        <p className="mb-2 text-xs text-muted-foreground">Onde o bloqueio vale:</p>
        <div className="space-y-2">
          {SCOPE_FRONTS.map((front: ScopeFront) => (
            <label key={front} className="flex items-center justify-between gap-4 text-sm">
              <span>{SCOPE_FRONT_LABEL[front]}</span>
              <Switch
                aria-label={SCOPE_FRONT_LABEL[front]}
                checked={scope.applies.includes(front)}
                disabled={disabled || scope.mode !== "block"}
                onCheckedChange={(v) =>
                  onChange({
                    ...scope,
                    applies: v
                      ? Array.from(new Set([...scope.applies, front]))
                      : scope.applies.filter((f) => f !== front),
                  })
                }
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
