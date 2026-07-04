export type PortalPlatform = "instagram" | "linkedin";

export interface PortalPost {
  token: string;
  brand: { name: string; handle: string; avatarUrl?: string };
  agency: string;
  platform: PortalPlatform;
  scheduledFor: string; // ISO
  imageUrl: string;
  caption: string; // markdown-ish, supports **bold**
  hashtags: string[];
}

export interface TimelineEvent {
  id: string;
  kind: "created" | "sent" | "changes" | "revision" | "approved";
  actor: string;
  message: string;
  at: string;
}

export const MOCK_PORTAL_POST: PortalPost = {
  token: "demo",
  brand: {
    name: "Aurora Labs",
    handle: "@auroralabs",
  },
  agency: "NexusFlow Studio",
  platform: "instagram",
  scheduledFor: "2026-07-10T14:00:00.000Z",
  imageUrl:
    "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=80",
  caption: `A **próxima onda de produtividade** não vem de mais telas — vem de menos atrito.\n\nNosso novo copiloto de IA lê seu contexto, sugere próximos passos e executa fluxos inteiros com um toque.\n\n**3 mudanças que você vai sentir na primeira semana:**\n• Zero tarefas repetitivas de status\n• Reuniões 40% mais curtas\n• Decisões apoiadas por dados em tempo real\n\nJá disponível em beta fechado. Link na bio para entrar na lista. 🚀`,
  hashtags: ["IA", "Produtividade", "FuturoDoTrabalho", "AuroraLabs"],
};

export const MOCK_TIMELINE: TimelineEvent[] = [
  {
    id: "t1",
    kind: "created",
    actor: "NexusFlow Studio",
    message: "Post criado pela agência",
    at: "2026-07-02T09:12:00.000Z",
  },
  {
    id: "t2",
    kind: "changes",
    actor: "Aurora Labs",
    message: "Ajuste solicitado: reforçar o benefício de 'menos reuniões'.",
    at: "2026-07-02T18:40:00.000Z",
  },
  {
    id: "t3",
    kind: "revision",
    actor: "NexusFlow Studio",
    message: "Nova versão enviada para aprovação",
    at: "2026-07-03T10:05:00.000Z",
  },
  {
    id: "t4",
    kind: "sent",
    actor: "NexusFlow Studio",
    message: "Link de aprovação enviado ao cliente",
    at: "2026-07-03T10:06:00.000Z",
  },
];