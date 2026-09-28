import { createFileRoute } from "@tanstack/react-router";
import { ProjectModelsPage } from "./projects.models";

export const Route = createFileRoute("/_authenticated/projects/models/")({
  head: () => ({ meta: [
    { title: "Modelos de projeto | Unitos" },
    { name: "description", content: "Consulte e gerencie modelos de projeto reutilizáveis." },
    { property: "og:title", content: "Modelos de projeto | Unitos" },
    { property: "og:description", content: "Consulte e gerencie modelos de projeto reutilizáveis." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ProjectModelsPage,
});