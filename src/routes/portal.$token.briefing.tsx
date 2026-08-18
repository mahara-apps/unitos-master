import { createFileRoute } from "@tanstack/react-router";
import { BriefingTab } from "@/components/portal/portal-tabs";

export const Route = createFileRoute("/portal/$token/briefing")({
  component: PortalBriefingRoute,
});

function PortalBriefingRoute() {
  return <BriefingTab />;
}
