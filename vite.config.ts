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

const envCompatibilityPlugin = () => ({
  name: "officeneed-env-compat",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    const normalizedId = id.replaceAll("\\", "/");
    const isSupabaseClient = normalizedId.endsWith("/src/integrations/supabase/client.ts");
    const isGoogleAnalytics = normalizedId.endsWith("/src/lib/google-analytics.ts");
    if (!isSupabaseClient && !isGoogleAnalytics) return null;

    let updated = code;
    if (isSupabaseClient) {
      updated = updated
        .replaceAll("import.meta.env['VITE_SUPABASE_URL']", "import.meta.env.VITE_SUPABASE_URL")
        .replaceAll(
          "import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY']",
          "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY",
        );
    }
    if (isGoogleAnalytics) {
      updated = updated.replaceAll(
        "import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY']",
        "import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY",
      );
    }

    return updated === code ? null : { code: updated, map: null };
  },
});

if (supabaseUrl) process.env["VITE_SUPABASE_URL"] = supabaseUrl;
if (supabasePublishableKey) process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] = supabasePublishableKey;

// Meta Pixel ID is public (it appears in the browser by design).
const metaPixelId = process.env["VITE_META_PIXEL_ID"] ?? process.env["META_PIXEL_ID"] ?? "1610689520588834";
process.env["VITE_META_PIXEL_ID"] = metaPixelId;

// Google Analytics 4 Measurement ID is public (appears in browser script tags by design).
const fallbackGoogleAnalyticsId = "G-34E9F2S835";
const googleAnalyticsId = (
  process.env["VITE_GA_MEASUREMENT_ID"] ??
  process.env["VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY"] ??
  process.env["LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY"] ??
  process.env["GA_MEASUREMENT_ID"] ??
  fallbackGoogleAnalyticsId
).trim();

process.env["VITE_GA_MEASUREMENT_ID"] = googleAnalyticsId;
process.env["VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY"] = googleAnalyticsId;

export default defineConfig({
  vite: {
    plugins: [envCompatibilityPlugin()],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
      "import.meta.env.VITE_META_PIXEL_ID": JSON.stringify(metaPixelId),
      "import.meta.env.VITE_GA_MEASUREMENT_ID": JSON.stringify(googleAnalyticsId),
      "import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY": JSON.stringify(googleAnalyticsId),
      "import.meta.env.VITE_GA4_MEASUREMENT_ID": JSON.stringify(googleAnalyticsId),
      "import.meta.env.VITE_GOOGLE_ANALYTICS_ID": JSON.stringify(googleAnalyticsId),
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
