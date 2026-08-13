import { createClient } from "@supabase/supabase-js";
const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SB_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key);
const { generatePostContent } = await import("./src/lib/post-agents.server.ts");
const pick = async (phase: string) => {
  const { data } = await sb.from("posts").select("id,title,ai_phase").eq("ai_phase", phase).is("deleted_at", null).limit(1);
  return data?.[0];
};
for (const phase of ["idea", "copy_failed"]) {
  const p = await pick(phase);
  if (!p) { console.log(phase, "sem candidato"); continue; }
  console.log("== testando", phase, p.id, p.title);
  const res = await generatePostContent(p.id, { force: false });
  console.log(JSON.stringify(res));
  const { data } = await sb.from("posts").select("ai_phase, copy").eq("id", p.id).single();
  console.log("=> fase:", data?.ai_phase, "| caption len:", (data?.copy ?? "").length);
}
