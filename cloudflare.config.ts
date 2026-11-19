// Isolated Sutra deployment target; do not attach production domains until acceptance is complete.
import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "sutra",
    entrypoint: "./src/server.ts",
    compatibilityDate: "2026-11-19",
    compatibilityFlags: ["nodejs_compat"],
    observability: {
      enabled: true,
    },
  },
});
