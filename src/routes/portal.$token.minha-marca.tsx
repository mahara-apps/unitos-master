import { createFileRoute } from "@tanstack/react-router";
import { BrandTab } from "@/components/portal/portal-tabs";

export const Route = createFileRoute("/portal/$token/minha-marca")({
  component: () => <BrandTab />,
});
