import { createFileRoute } from "@tanstack/react-router";
import { HomeTab } from "@/components/portal/portal-tabs";

export const Route = createFileRoute("/portal/$token/")({
  component: PortalHomeRoute,
});

function PortalHomeRoute() {
  const { token } = Route.useParams();
  return <HomeTab token={token} />;
}
