// Isolated Auralink preview. No production domains, scheduled jobs, or Auraluxe inventory sync.
import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "bizsathi-auralink-preview",
    entrypoint: "./src/server.ts",
    compatibilityDate: "2026-11-19",
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    observability: {
      enabled: true,
    },
  },
});
