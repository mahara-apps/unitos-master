import { createFileRoute } from "@tanstack/react-router";
import { migrateBrandAssetsToBrandMediaFn } from "@/lib/migrate-brand-assets.functions";

export const Route = createFileRoute("/api/public/migrate-brand-assets")({
  server: {
    handlers: {
      POST: async () => {
        const result = await migrateBrandAssetsToBrandMediaFn();
        return new Response(JSON.stringify(result, null, 2), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});