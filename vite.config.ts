// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

const fallbackSupabaseUrl = "https://kzyblydpvvbjmyzzflpr.supabase.co";
const fallbackSupabasePublishableKey = "sb_publishable_zhueg5QBG3x9bT4eqhPQbw_JrD35kgw";

const supabaseUrl =
  process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? fallbackSupabaseUrl;
const supabasePublishableKey =
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
  process.env["SUPABASE_PUBLISHABLE_KEY"] ??
  fallbackSupabasePublishableKey;

// Vite replaces `import.meta.env["X"]` with an object holding EVERY VITE_* value,
// so bracket access (which tsconfig requires) is rewritten to the single-value form.
const ENV_BRACKET_ACCESS = /import\.meta\.env\[\s*["'](VITE_\w+)["']\s*\]/g;

const envCompatibilityPlugin = () => ({
  name: "officeneed-env-compat",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!id.replaceAll("\\", "/").includes("/src/")) return null;
    const updated = code.replace(ENV_BRACKET_ACCESS, "import.meta.env.$1");
    return updated === code ? null : { code: updated, map: null };
  },
});

// Background-removal provider keys are server secrets: they are read only from
// API4AI_API_KEY / REMOVE_BG_API_KEY at runtime
// (src/lib/background-removal-providers.server.ts) and never belong in a bundle.
const SERVER_SECRET_ENVS = ["API4AI_API_KEY", "REMOVE_BG_API_KEY"] as const;
const FORBIDDEN_CLIENT_ENVS = SERVER_SECRET_ENVS.map((name) => `VITE_${name}`);

const serverSecretGuardPlugin = () => {
  let secrets: string[] = [];
  return {
    name: "officeneed-server-secret-guard",
    configResolved(config: { mode: string; env: Record<string, unknown>; define?: Record<string, unknown> }) {
      const env = loadEnv(config.mode, process.cwd(), "");
      secrets = [...SERVER_SECRET_ENVS, ...FORBIDDEN_CLIENT_ENVS]
        .map((name) => env[name])
        .filter((v): v is string => !!v);
      for (const forbidden of FORBIDDEN_CLIENT_ENVS) {
        if (forbidden in config.env) {
          delete config.env[forbidden];
          if (config.define) delete config.define[`import.meta.env.${forbidden}`];
          console.warn(`[env] Ignoring ${forbidden}: delete it and use ${forbidden.slice("VITE_".length)} (server only).`);
        }
      }
    },
    generateBundle(
      this: { error(message: string): never },
      _options: unknown,
      bundle: Record<string, { type: string; code?: string; source?: string | Uint8Array; fileName: string }>,
    ) {
      for (const file of Object.values(bundle)) {
        const text = file.type === "chunk" ? (file.code ?? "") : String(file.source ?? "");
        if (FORBIDDEN_CLIENT_ENVS.some((name) => text.includes(name)) || secrets.some((secret) => text.includes(secret))) {
          // Names the file only; the value must never reach build logs.
          this.error(`Background-removal API key found in build output: ${file.fileName}`);
        }
      }
    },
  };
};

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
    plugins: [envCompatibilityPlugin(), serverSecretGuardPlugin()],
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
