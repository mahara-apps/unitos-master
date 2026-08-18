import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  getPortalMetricsFn,
  listPortalApprovalsFn,
  getPortalPostFn,
  decidePortalApprovalFn,
  listPortalCalendarFn,
  listPortalFilesFn,
  listPortalBriefingsFn,
} from "@/lib/portal-public.functions";
import {
  getPortalSessionMetricsFn,
  listPortalSessionApprovalsFn,
  getPortalSessionPostFn,
  decidePortalSessionApprovalFn,
  listPortalSessionCalendarFn,
  listPortalSessionFilesFn,
  listPortalSessionBriefingsFn,
} from "@/lib/portal-session.functions";
import {
  listPortalBriefingRequestsFn,
  submitPortalBriefingProposalFn,
  listPortalSessionBriefingRequestsFn,
  submitPortalSessionBriefingProposalFn,
} from "@/lib/portal-briefing.functions";
import {
  listPortalPlansFn,
  getPortalPlanFn,
  decidePortalPlanFn,
  listPortalSessionPlansFn,
  getPortalSessionPlanFn,
  decidePortalSessionPlanFn,
} from "@/lib/portal-pauta.functions";
import type { PortalTabId } from "./portal-nav";

/**
 * Camada única de dados do Portal do Cliente.
 *
 * O portal autenticado (`/area/*`) é a experiência principal e o link por token
 * (`/portal/$token/*`) segue como convite/fallback. As telas são as mesmas: elas
 * consomem `usePortalApi()` e nunca sabem qual modo está ativo. Cada operação
 * existe uma única vez no servidor por modo e ambas chamam as mesmas RPCs
 * `public.portal_*` / o mesmo núcleo de decisão de pauta.
 */

export type PortalMode =
  | { kind: "token"; token: string }
  | { kind: "session"; clientId?: string | null };

const ModeContext = createContext<PortalMode>({ kind: "session", clientId: null });

export function PortalModeProvider({ value, children }: { value: PortalMode; children: ReactNode }) {
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function usePortalMode() {
  return useContext(ModeContext);
}

/** Chave estável para o react-query, isolando cliente/token. */
export function portalScopeKey(mode: PortalMode): string {
  return mode.kind === "token" ? `t:${mode.token}` : `s:${mode.clientId ?? "default"}`;
}

type ApprovalStatus = "all" | "pending" | "approved" | "adjust";
type PostDecision = "approved" | "rejected" | "adjust" | "comment";
type PlanDecision = "approve" | "reject" | "changes" | "per_item";
type PlanItems = Array<{ topicId: string; decision: "approved" | "rejected" | "changes"; comment: string }>;

export function usePortalApi() {
  const mode = usePortalMode();

  const tMetrics = useServerFn(getPortalMetricsFn);
  const tApprovals = useServerFn(listPortalApprovalsFn);
  const tPost = useServerFn(getPortalPostFn);
  const tDecide = useServerFn(decidePortalApprovalFn);
  const tCalendar = useServerFn(listPortalCalendarFn);
  const tFiles = useServerFn(listPortalFilesFn);
  const tBriefings = useServerFn(listPortalBriefingsFn);
  const tPlans = useServerFn(listPortalPlansFn);
  const tPlan = useServerFn(getPortalPlanFn);
  const tDecidePlan = useServerFn(decidePortalPlanFn);

  const sMetrics = useServerFn(getPortalSessionMetricsFn);
  const sApprovals = useServerFn(listPortalSessionApprovalsFn);
  const sPost = useServerFn(getPortalSessionPostFn);
  const sDecide = useServerFn(decidePortalSessionApprovalFn);
  const sCalendar = useServerFn(listPortalSessionCalendarFn);
  const sFiles = useServerFn(listPortalSessionFilesFn);
  const sBriefings = useServerFn(listPortalSessionBriefingsFn);
  const sPlans = useServerFn(listPortalSessionPlansFn);
  const sPlan = useServerFn(getPortalSessionPlanFn);
  const sDecidePlan = useServerFn(decidePortalSessionPlanFn);

  return useMemo(() => {
    const isToken = mode.kind === "token";
    const token = mode.kind === "token" ? mode.token : "";
    const clientId = mode.kind === "session" ? mode.clientId ?? undefined : undefined;
    const base = isToken ? { token } : clientId ? { clientId } : {};

    return {
      isToken,
      /** Identidade é digitada no modo token; no login vem do usuário logado. */
      requiresIdentity: isToken,
      scopeKey: portalScopeKey(mode),
      metrics: () => (isToken ? tMetrics({ data: { token } }) : sMetrics({ data: base })),
      approvals: (status: ApprovalStatus) =>
        isToken ? tApprovals({ data: { token, status } }) : sApprovals({ data: { ...base, status } }),
      post: (postId: string) =>
        isToken ? tPost({ data: { token, postId } }) : sPost({ data: { ...base, postId } }),
      decidePost: (input: { postId: string; decision: PostDecision; note?: string; identity: string }) =>
        isToken
          ? tDecide({ data: { token, ...input } })
          : sDecide({
              data: { ...base, postId: input.postId, decision: input.decision, note: input.note },
            }),
      calendar: (month: string) =>
        isToken ? tCalendar({ data: { token, month } }) : sCalendar({ data: { ...base, month } }),
      files: (search: string) =>
        isToken ? tFiles({ data: { token, search } }) : sFiles({ data: { ...base, search } }),
      briefings: () => (isToken ? tBriefings({ data: { token } }) : sBriefings({ data: base })),
      plans: () => (isToken ? tPlans({ data: { token } }) : sPlans({ data: base })),
      plan: (planId: string) =>
        isToken ? tPlan({ data: { token, planId } }) : sPlan({ data: { ...base, planId } }),
      decidePlan: (input: {
        planId: string;
        decision: PlanDecision;
        feedback?: string;
        items?: PlanItems;
      }) => (isToken ? tDecidePlan({ data: { token, ...input } }) : sDecidePlan({ data: { ...base, ...input } })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind, mode.kind === "token" ? mode.token : mode.clientId]);
}

/* ------------------------------- navegação -------------------------------- */

const SESSION_PATHS: Record<PortalTabId, string> = {
  home: "/area/inicio",
  approvals: "/area/aprovacoes",
  calendar: "/area/calendario",
  files: "/area/arquivos",
  briefing: "/area/briefing",
};

const TOKEN_PATHS: Record<PortalTabId, string> = {
  home: "/portal/$token/",
  approvals: "/portal/$token/aprovacoes",
  calendar: "/portal/$token/calendario",
  files: "/portal/$token/arquivos",
  briefing: "/portal/$token/briefing",
};

/** Path da aba no modo ativo — usado por navegação e detecção de aba ativa. */
export function usePortalPath(tab: PortalTabId): string {
  const mode = usePortalMode();
  return mode.kind === "token"
    ? TOKEN_PATHS[tab].replace("$token", mode.token)
    : SESSION_PATHS[tab];
}

/** Link interno agnóstico de modo. */
export function PortalLink({
  tab,
  className,
  children,
}: {
  tab: PortalTabId;
  className?: string;
  children: ReactNode;
}) {
  const mode = usePortalMode();
  if (mode.kind === "token") {
    return (
      <Link
        to={TOKEN_PATHS[tab] as "/portal/$token"}
        params={{ token: mode.token }}
        className={className}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link to={SESSION_PATHS[tab] as "/area/inicio"} className={className}>
      {children}
    </Link>
  );
}
