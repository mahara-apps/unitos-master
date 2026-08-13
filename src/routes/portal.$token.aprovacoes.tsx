import { createFileRoute } from "@tanstack/react-router";
import { ApprovalsTab } from "@/components/portal/portal-tabs";

export const Route = createFileRoute("/portal/$token/aprovacoes")({
  component: PortalApprovalsRoute,
});

function PortalApprovalsRoute() {
  const { token } = Route.useParams();
  return <ApprovalsTab token={token} />;
}
