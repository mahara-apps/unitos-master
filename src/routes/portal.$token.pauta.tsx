import { createFileRoute } from "@tanstack/react-router";
import { PautaTab } from "@/components/portal/portal-tabs";

export const Route = createFileRoute("/portal/$token/pauta")({
  component: () => <PautaTab />,
});
