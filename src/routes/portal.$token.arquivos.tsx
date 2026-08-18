import { createFileRoute } from "@tanstack/react-router";
import { FilesTab } from "@/components/portal/portal-tabs";

export const Route = createFileRoute("/portal/$token/arquivos")({
  component: PortalFilesRoute,
});

function PortalFilesRoute() {
  return <FilesTab />;
}
