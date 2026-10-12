import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { attachSupabaseAuth } from "./integrations/supabase/auth-attacher";
import { renderErrorPage } from "./lib/error-page";
import { handleAccessGateRequest } from "./lib/access-gate.server";

// Temporary, pre-launch access gate -- see src/lib/access-gate.server.ts
// for the toggle and full behavior. A no-op (always calls next()) unless
// OFFICENEED_ACCESS_GATE_ENABLED=true is set in the environment.
const accessGateMiddleware = createMiddleware().server(async ({ request, pathname, next, handlerType }) => {
  const gateResponse = await handleAccessGateRequest({ request, pathname, handlerType });
  if (gateResponse) return gateResponse;
  return next();
});

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

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, accessGateMiddleware, csrfMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
