// Tipos client-safe da central de acompanhamento da conta do cliente.
// Somente leitura: nenhum dado é criado/alterado por este módulo.

export type ClientStageStat = {
  id: string;
  key: string;
  label: string;
  count: number;
  share: number;
};

export type ClientAttentionItem = {
  id: string;
  severity: "critical" | "warning";
  title: string;
  description: string;
  detail: string | null;
  action: { label: string; to: string; search?: Record<string, string> } | null;
};

export type ClientUpcomingItem = {
  id: string;
  title: string;
  scheduledAt: string;
  channels: string[];
  format: string | null;
  status: "scheduled" | "awaiting_approval" | "failed" | "published";
};

export type ClientActivityItem = {
  id: string;
  title: string;
  description: string;
  at: string;
  tone: "neutral" | "positive" | "attention";
};

export type ClientDashboard = {
  generatedAt: string;
  rangeDays: number;
  client: { id: string; name: string; niche: string | null } | null;

  /** Pipeline real (etapas do Kanban do cliente). */
  stages: ClientStageStat[];
  pipelineTotal: number;
  bottleneck: { label: string; count: number; share: number } | null;

  approvalsPending: number;
  approvalsDecided: number;

  publishedInRange: number;
  publishedPreviousRange: number | null;
  publishTrend: Array<{ day: string; count: number }>;
  avgPerWeek: number | null;
  bestDay: { day: string; count: number } | null;

  channelBreakdown: Array<{ channel: string; count: number; share: number }>;

  scheduledCount: number;
  failedCount: number;
  connectionsNeedingAttention: number;

  upcoming: ClientUpcomingItem[];
  attention: ClientAttentionItem[];
  activity: ClientActivityItem[];

  /** Métricas de alcance/engajamento só existem quando há coleta real. */
  hasPerformanceData: boolean;
};
