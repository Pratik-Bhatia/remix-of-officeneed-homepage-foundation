// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const fallbackSupabaseUrl = "https://kzyblydpvvbjmyzzflpr.supabase.co";
const fallbackSupabasePublishableKey = "sb_publishable_zhueg5QBG3x9bT4eqhPQbw_JrD35kgw";

const supabaseUrl =
  process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? fallbackSupabaseUrl;
const supabasePublishableKey =
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
  process.env["SUPABASE_PUBLISHABLE_KEY"] ??
  fallbackSupabasePublishableKey;

const supabaseEnvCompatibilityPlugin = () => ({
  name: "officeneed-supabase-env-compat",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    const normalizedId = id.replaceAll("\\", "/");
    if (!normalizedId.endsWith("/src/integrations/supabase/client.ts")) return null;

    const updated = code
      .replaceAll("import.meta.env['VITE_SUPABASE_URL']", "import.meta.env.VITE_SUPABASE_URL")
      .replaceAll(
        "import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY']",
        "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY",
      );

    return updated === code ? null : { code: updated, map: null };
  },
});

if (supabaseUrl) process.env["VITE_SUPABASE_URL"] = supabaseUrl;
if (supabasePublishableKey) process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] = supabasePublishableKey;

export default defineConfig({
  vite: {
    plugins: [supabaseEnvCompatibilityPlugin()],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
