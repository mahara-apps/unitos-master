import { createFileRoute } from "@tanstack/react-router";
import { ProjectModelsPage } from "./projects.models";

export const Route = createFileRoute("/_authenticated/projects/models/$templateId")({
  head: () => ({ meta: [
    { title: "Editar modelo de projeto | Unitos" },
    { name: "description", content: "Edite a estrutura e os textos padrão de um modelo de projeto." },
    { property: "og:title", content: "Editar modelo de projeto | Unitos" },
    { property: "og:description", content: "Edite a estrutura e os textos padrão de um modelo de projeto." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ProjectModelsPage mode="edit" initialTemplateId={Route.useParams().templateId} />,
});