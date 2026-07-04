export type PostStatus =
  | "idea"
  | "in_production"
  | "internal_review"
  | "client_review"
  | "approved";

export type Platform = "instagram" | "linkedin" | "twitter" | "tiktok";

export interface Assignee {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface Post {
  id: string;
  title: string;
  copy: string;
  imageUrl?: string;
  platform: Platform;
  status: PostStatus;
  assignee: Assignee;
  campaignId: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  name: string;
}

export const COLUMNS: { id: PostStatus; title: string }[] = [
  { id: "idea", title: "Ideia" },
  { id: "in_production", title: "Em Produção" },
  { id: "internal_review", title: "Revisão Interna" },
  { id: "client_review", title: "Aprovação Externa" },
  { id: "approved", title: "Aprovado" },
];