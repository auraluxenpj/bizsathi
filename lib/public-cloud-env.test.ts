// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv, type ConfigEnv } from "vite";
import { publicCloudDefines } from "./lib/public-cloud-env";

const FALLBACK_SUPABASE_URL = "https://glulsxmkkdeaenoovgsm.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "sb_publishable__yFYJAJZonUt5J2yCwOTcA_hScpK1rh";

export default (env: ConfigEnv) => {
  const publicEnv = loadEnv(env.mode, process.cwd(), "VITE_");
  const withFallback = {
    ...publicEnv,
    VITE_SUPABASE_URL: publicEnv.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY:
      publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY || FALLBACK_SUPABASE_PUBLISHABLE_KEY,
  };

  return defineConfig({
    vite: {
      define: publicCloudDefines(withFallback),
    },
    tanstackStart: {
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      // nitro/vite builds from this
      server: { entry: "server" },
    },
  })(env);
};
