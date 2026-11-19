import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "bizsathi",
    entrypoint: "./src/server.ts",
    compatibilityDate: "2026-11-19",
    compatibilityFlags: ["nodejs_compat"],
    observability: {
      enabled: true,
    },
  },
});
