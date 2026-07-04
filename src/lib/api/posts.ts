import { MOCK_POSTS, MOCK_CAMPAIGNS } from "@/features/production/mock-data";
import type { Post, Campaign } from "@/features/production/types";

// Mocked API — swap with Supabase queries when ready.
let posts: Post[] = [...MOCK_POSTS];

export async function fetchPosts(campaignId: string): Promise<Post[]> {
  await new Promise((r) => setTimeout(r, 250));
  return posts.filter((p) => p.campaignId === campaignId);
}

export async function fetchCampaigns(): Promise<Campaign[]> {
  await new Promise((r) => setTimeout(r, 100));
  return MOCK_CAMPAIGNS;
}

export async function updatePost(next: Post): Promise<Post> {
  posts = posts.map((p) => (p.id === next.id ? next : p));
  return next;
}

export async function createPost(input: Omit<Post, "id" | "updatedAt">): Promise<Post> {
  const post: Post = {
    ...input,
    id: `p${Date.now()}`,
    updatedAt: new Date().toISOString(),
  };
  posts = [post, ...posts];
  return post;
}