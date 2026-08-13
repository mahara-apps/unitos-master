import { createFileRoute } from "@tanstack/react-router";
import { CalendarTab } from "@/components/portal/portal-tabs";

export const Route = createFileRoute("/portal/$token/calendario")({
  component: PortalCalendarRoute,
});

function PortalCalendarRoute() {
  const { token } = Route.useParams();
  return <CalendarTab token={token} />;
}
