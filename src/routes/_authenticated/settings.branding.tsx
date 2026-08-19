import { createFileRoute, redirect } from "@tanstack/react-router";

// A identidade visual passou a viver na aba "Agência" (escopo Workspace),
// junto dos dados cadastrais da marca. Rota preservada para links antigos.
export const Route = createFileRoute("/_authenticated/settings/branding")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/identity" });
  },
});
