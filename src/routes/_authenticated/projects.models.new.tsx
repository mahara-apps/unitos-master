import { createFileRoute } from "@tanstack/react-router";
import { ProjectModelsPage } from "./projects.models";

export const Route = createFileRoute("/_authenticated/projects/models/new")({
  head: () => ({ meta: [
    { title: "Novo modelo de projeto | Unitos" },
    { name: "description", content: "Crie um modelo de projeto reutilizável." },
    { property: "og:title", content: "Novo modelo de projeto | Unitos" },
    { property: "og:description", content: "Crie um modelo de projeto reutilizável." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ProjectModelsPage mode="new" />,
});