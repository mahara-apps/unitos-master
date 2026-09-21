import { MASTER_RELEASE_VERSION } from "./manager-contract";

export const CONTROL_PLANE_PROJECT_REF = "tkjbhttylouamqxnbfgv";
export const APEX_INSTALLATION_ID = "0b6b7f5c-44e5-4e85-a33c-37014ed044a2";
export const APEX_OPERATION_ID = "7ff64a81-af3d-432f-b3d3-2a1412dda404";
export const CONTROL_PLANE_REPAIR_PLAN_VERSION = "1.4.19-repair.1";
export const CONTROL_PLANE_RISK_CONFIRMATION =
  "ACCEPT_EXISTING_CONTROL_PLANE_WITHOUT_RESTORABLE_BACKUP";

export type RepairVerdict = "PASS" | "BLOCK";
export type RepairGateStatus = "pass" | "block" | "pending";

export type RepairBlocker = {
  id: string;
  label: string;
  evidence: string;
  status: "confirmed";
};

export type RepairGate = {
  id: string;
  label: string;
  requirement: string;
  status: RepairGateStatus;
};

export type RepairStep = {
  order: number;
  id: string;
  title: string;
  artifact: string;
  dependsOn: string[];
  approval: string;
  idempotency: string;
  rollback: string;
  validations: string[];
};

export const CONTROL_PLANE_ARTIFACTS = [
  {
    file: "002_control_plane_global_freeze.sql",
    sha256: "d6af4b091e21efaef7051841f20ccf07ba2313f8d4a33068b40ec14ef868a152",
    purpose: "2 tabelas, 3 funções e 8 triggers do freeze global",
  },
  {
    file: "global-freeze-install-preflight.sql",
    sha256: "389272f1ee42b3a82f8e3d3d8a79c18360ae1c499b3f2dca2db46c48aec11e5d",
    purpose: "preflight somente leitura 8/8",
  },
  {
    file: "003_control_plane_deterministic_update.sql",
    sha256: "bbcb76b9456f72e36464d62c2beb0a13fe8ad9a72207ef3343edd1d8930d1dd5",
    purpose: "finalização determinística com fencing, ledger e checkpoints",
  },
  {
    file: "install-deterministic-update.sql",
    sha256: "7aa125efc877ce7971f8781d2dfaee126a35cecf1b6d4373642e7480cc3c47b1",
    purpose: "instalação transacional do executor",
  },
  {
    file: "20260919143000_recover_missing_legacy_reconciliation.sql",
    sha256: "fade159b6675008eb05539eceaef97da73d14013f78979a76038aaf245e94e37",
    purpose: "recovery exclusiva da lacuna 1.4.14",
  },
  {
    file: "recovery-control-plane-preflight.sql",
    sha256: "ec60d9f4ca5d4fbbd280807655260dfb0395c98c04bf5830ac6850326cc6e179",
    purpose: "preflight somente leitura 17/17",
  },
] as const;

export const CONFIRMED_REMOTE_BLOCKERS: RepairBlocker[] = [
  {
    id: "freeze",
    label: "Contrato de freeze ausente",
    evidence:
      "As tabelas do freeze e a função installation_operations_freeze_guard não existem remotamente.",
    status: "confirmed",
  },
  {
    id: "executor",
    label: "Executor determinístico ausente",
    evidence:
      "O contrato remoto não possui o conjunto 1.4.19 de finalização fenced, ledger e checkpoints.",
    status: "confirmed",
  },
  {
    id: "recovery",
    label: "Recovery 1.4.14 ausente",
    evidence: "A reconciliação exigida pelo contrato 1.4.14 não foi comprovada no estado remoto.",
    status: "confirmed",
  },
  {
    id: "cron",
    label: "Cron de retomada inativo",
    evidence: "Job 37, installation-provision-resume, permanece inativo.",
    status: "confirmed",
  },
  {
    id: "versions",
    label: "Versões divergentes",
    evidence: "Versão atual, release fixada e versão publicada não convergem para 1.4.19.",
    status: "confirmed",
  },
  {
    id: "endpoints",
    label: "Endpoints públicos indisponíveis",
    evidence: "As consultas públicas de versão e saúde responderam 404 na auditoria remota.",
    status: "confirmed",
  },
];

export const REPAIR_GATES: RepairGate[] = [
  {
    id: "identity",
    label: "Identidade canônica",
    requirement: `Projeto e conexão devem identificar exatamente ${CONTROL_PLANE_PROJECT_REF}.`,
    status: "pass",
  },
  {
    id: "connection",
    label: "Conexão de escrita autorizada",
    requirement:
      "A conexão deve ser fornecida ao executor selado e validada antes de qualquer consulta operacional.",
    status: "block",
  },
  {
    id: "operator",
    label: "Operador autenticado",
    requirement:
      "Super Admin autenticado e operador nominal devem coincidir com a autorização da etapa.",
    status: "block",
  },
  {
    id: "reason",
    label: "Justificativa específica",
    requirement:
      "O risco e o objetivo da etapa devem ser descritos de forma específica, sem segredos.",
    status: "block",
  },
  {
    id: "risk",
    label: "Confirmação literal de risco",
    requirement: `Exigir ${CONTROL_PLANE_RISK_CONFIRMATION}.`,
    status: "block",
  },
  {
    id: "audit",
    label: "Auditoria JSONL persistente",
    requirement: "Destino absoluto .jsonl, persistente e não simbólico, deve estar disponível.",
    status: "block",
  },
  {
    id: "preflight",
    label: "Preflight remoto atualizado",
    requirement: "Todos os checks da etapa devem retornar PASS, sem atividade ou ambiguidade.",
    status: "block",
  },
];

export const REPAIR_STEPS: RepairStep[] = [
  {
    order: 1,
    id: "freeze-install",
    title: "Instalar o contrato de freeze",
    artifact: "--install-global-freeze",
    dependsOn: ["identity", "connection", "operator", "reason", "risk", "audit", "preflight"],
    approval: "INSTALL_GLOBAL_FREEZE_ONLY",
    idempotency:
      "Instalador selado, transação única e verificação de 2 tabelas, 3 funções, 8 triggers, ACL e RLS.",
    rollback:
      "Falha antes do COMMIT reverte integralmente; após sucesso, não remover objetos automaticamente.",
    validations: ["Hashes do contrato", "Preflight 8/8", "Estado inicial inativo", "Apex intacta"],
  },
  {
    order: 2,
    id: "freeze-enable",
    title: "Ativar o freeze global",
    artifact: "control_plane_freeze.sh freeze",
    dependsOn: ["freeze-install"],
    approval: "I_UNDERSTAND_GLOBAL_CONTROL_PLANE_FREEZE",
    idempotency:
      "Geração esperada e advisory lock impedem escritor obsoleto ou ativação concorrente.",
    rollback:
      "Descongelamento exige autorização independente e somente após validação pós-bootstrap.",
    validations: ["Quiescência", "Estado ativo", "Geração incrementada", "Cron 37 inativo"],
  },
  {
    order: 3,
    id: "executor-install",
    title: "Instalar executor, ledger e checkpoints",
    artifact: "--install-deterministic-update",
    dependsOn: ["freeze-enable"],
    approval: "INSTALL_DETERMINISTIC_UPDATE_ONLY",
    idempotency: "Preflight 5/5, advisory lock e instalação transacional do contrato 1.4.19.",
    rollback:
      "Falha transacional não publica objetos parciais; sucesso exige preservação e nova decisão.",
    validations: ["RPCs e assinaturas", "Fencing", "Ledger", "Checkpoints", "ACL/RLS"],
  },
  {
    order: 4,
    id: "recovery",
    title: "Executar somente a recovery 1.4.14",
    artifact: "--recover-missing-1.4.10",
    dependsOn: ["executor-install"],
    approval: "RECOVER_MISSING_1_4_10_ONLY",
    idempotency: "CLI 2.117.0, staging selado, dry-run exclusivo e snapshots imutáveis do ledger.",
    rollback:
      "A transação reverte em falha; não existe compensação automática após confirmação no ledger.",
    validations: ["Preflight 17/17", "Seleção exclusiva 20260919143000", "Ledger 0/1/1", "Hashes"],
  },
  {
    order: 5,
    id: "contract-validation",
    title: "Validar o contrato completo",
    artifact: "verify-installation-master.sql",
    dependsOn: ["recovery"],
    approval: "Aprovação objetiva do relatório sem FAIL",
    idempotency: "Auditoria somente leitura repetível.",
    rollback: "Mantém freeze ativo e interrompe o fluxo quando houver qualquer divergência.",
    validations: ["Integridade", "Versões", "Freeze", "Executor", "Ledger", "Apex preservada"],
  },
  {
    order: 6,
    id: "cron-enable",
    title: "Autorizar a retomada do cron",
    artifact: "cron job 37",
    dependsOn: ["contract-validation"],
    approval: "Autorização independente para reativar o cron",
    idempotency: "Só permite ativação após contrato integralmente validado e executor operacional.",
    rollback:
      "Desativar exclusivamente o job 37 se a primeira execução não mantiver os invariantes.",
    validations: [
      "Executor operacional",
      "Sem concorrência",
      "Apex preservada",
      "Monitoramento da primeira claim",
    ],
  },
];

export const PROHIBITED_REPAIR_ACTIONS = [
  "Bypass do gate ou execução direta de artefato",
  "Alterar, cancelar, excluir ou substituir a operação Apex pendente",
  "Usar conexão alternativa que não identifique o Control-plane canônico",
  "Ativar o cron antes da validação integral do contrato",
  "Executar mais de uma etapa com a mesma autorização",
] as const;

export function getControlPlaneRepairReport() {
  return {
    schemaVersion: 1 as const,
    planVersion: CONTROL_PLANE_REPAIR_PLAN_VERSION,
    releaseVersion: MASTER_RELEASE_VERSION,
    projectRef: CONTROL_PLANE_PROJECT_REF,
    verdict: "BLOCK" as RepairVerdict,
    mode: "PREPARATION_ONLY" as const,
    remoteEvidence:
      "Última auditoria remota somente leitura; timestamp não comprovado no relatório.",
    apexProtection: {
      installationId: APEX_INSTALLATION_ID,
      operationId: APEX_OPERATION_ID,
      requiredState: "pending",
      invariant:
        "Preservar integralmente: 5 etapas pending, attempt_count 0, fencing_token 0, sem lease e sem efeitos.",
    },
    blockers: CONFIRMED_REMOTE_BLOCKERS,
    gates: REPAIR_GATES,
    artifacts: CONTROL_PLANE_ARTIFACTS,
    steps: REPAIR_STEPS,
    prohibitedActions: PROHIBITED_REPAIR_ACTIONS,
    nextDecision:
      "Nenhuma etapa pode ser executada enquanto todos os gates não estiverem comprovados.",
  };
}

export type ControlPlaneRepairReport = ReturnType<typeof getControlPlaneRepairReport>;

export function canExecuteControlPlaneRepair(gates: readonly RepairGate[]): boolean {
  return gates.length > 0 && gates.every((gate) => gate.status === "pass");
}

export function formatControlPlaneRepairReport(report: ControlPlaneRepairReport): string {
  const lines = [
    `REPARAÇÃO CONTROLADA DO CONTROL-PLANE — ${report.planVersion}`,
    `Decisão: ${report.verdict}`,
    `Projeto: ${report.projectRef}`,
    `Release: ${report.releaseVersion}`,
    `Evidência remota: ${report.remoteEvidence}`,
    "",
    "BLOQUEIOS CONFIRMADOS",
    ...report.blockers.map((item) => `- BLOCK | ${item.label}: ${item.evidence}`),
    "",
    "PRÉ-REQUISITOS",
    ...report.gates.map(
      (gate) => `- ${gate.status.toUpperCase()} | ${gate.label}: ${gate.requirement}`,
    ),
    "",
    "ORDEM DE EXECUÇÃO",
    ...report.steps.map(
      (step) =>
        `${step.order}. ${step.title} [${step.artifact}]\n   Dependências: ${step.dependsOn.join(", ")}\n   Autorização: ${step.approval}\n   Rollback: ${step.rollback}\n   Validação: ${step.validations.join("; ")}`,
    ),
    "",
    "PROTEÇÃO APEX",
    `- Instalação: ${report.apexProtection.installationId}`,
    `- Operação: ${report.apexProtection.operationId}`,
    `- Invariante: ${report.apexProtection.invariant}`,
    "",
    "PROIBIDO",
    ...report.prohibitedActions.map((item) => `- ${item}`),
    "",
    `STATUS FINAL: ${report.verdict} — ${report.nextDecision}`,
  ];
  return lines.join("\n");
}
