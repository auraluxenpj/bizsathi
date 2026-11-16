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
      server: { entry: "server" },
    },
  })(env);
};
