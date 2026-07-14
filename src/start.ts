import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { supabase } from "@/integrations/supabase/client";

// Client middleware that attaches the Supabase bearer token to every server
// function RPC. Unlike the generated `attachSupabaseAuth`, this one proactively
// refreshes an expired/near-expiry session so long-lived tabs don't start
// failing with "Unauthorized: No authorization header provided" after the
// access token silently expires.
const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let { data } = await supabase.auth.getSession();
    let token = data.session?.access_token;
    const expiresAt = data.session?.expires_at;
    const nearExpiry = expiresAt ? expiresAt * 1000 - Date.now() < 60_000 : false;
    if (!token || nearExpiry) {
      const refreshed = await supabase.auth.refreshSession().catch(() => null);
      token = refreshed?.data.session?.access_token ?? token;
    }
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
