import { createFileRoute } from "@tanstack/react-router";
import { brainConsolidateFn } from "@/lib/brain/legacy/brain-consolidate.functions";

export const Route = createFileRoute("/api/public/hooks/brain-consolidate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apiKey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }
        const result = await brainConsolidateFn({ data: {} });
        return Response.json(result);
      },
    },
  },
});