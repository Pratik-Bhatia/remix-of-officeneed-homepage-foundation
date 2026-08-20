import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

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

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Public server functions must still work when a deployment has no browser
// auth configuration. Protected functions remain protected by their server
// middleware; this only makes bearer-token attachment best-effort.
const safeAttachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    try {
      return await attachSupabaseAuth.options.client!({ next } as never);
    } catch (error) {
      console.warn("[auth] bearer token attachment skipped", error);
      return next();
    }
  },
);

export const startInstance = createStart(() => ({
  functionMiddleware: [safeAttachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
