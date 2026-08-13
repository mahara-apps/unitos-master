import { createFileRoute } from "@tanstack/react-router";
import { FeedTab } from "@/components/portal/portal-tabs";

export const Route = createFileRoute("/portal/$token/feed")({
  component: PortalFeedRoute,
});

function PortalFeedRoute() {
  const { token } = Route.useParams();
  return <FeedTab token={token} />;
}
