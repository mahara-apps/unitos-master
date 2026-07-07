import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout /app/clients — a lista fica em clients.index.tsx e os detalhes em
// clients.$clientId.*.tsx. Este arquivo só monta o outlet.
export const Route = createFileRoute("/_authenticated/app/clients")({
  component: () => <Outlet />,
});