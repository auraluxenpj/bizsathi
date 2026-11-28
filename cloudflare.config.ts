// Isolated Auralink preview. No production domains, scheduled jobs, or Auraluxe inventory sync.
import { bindings, defineConfig } from "cf/config";

const stagingSupabaseUrl = "https://vtqrygqprjvlytwjdpov.supabase.co";
const stagingSupabasePublishableKey = "sb_publishable_X5aH3ARjbFpRBZ9g5AEDWA_N17DovOd";

export default defineConfig({
  worker: {
    name: "bizsathi-auralink-preview",
    entrypoint: "./src/server.ts",
    compatibilityDate: "2026-11-19",
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    env: {
      SUPABASE_URL: bindings.text(stagingSupabaseUrl),
      SUPABASE_PUBLISHABLE_KEY: bindings.text(stagingSupabasePublishableKey),
    },
    observability: {
      enabled: true,
    },
  },
});
