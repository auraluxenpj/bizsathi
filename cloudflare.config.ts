// Isolated migration target; do not attach production domains until acceptance is complete.
import { bindings, defineConfig, triggers } from "cf/config";

export default defineConfig({
  worker: {
    name: "bizsathi-migration",
    entrypoint: "./src/server.ts",
    compatibilityDate: "2026-11-19",
    compatibilityFlags: ["nodejs_compat"],
    env: {
      AURALUXE_WEBSITE_INVENTORY_API_URL: bindings.text("https://www.auraluxe.com.np/api/public/bizsathi-inventory"),
    },
    observability: {
      enabled: true,
    },
    triggers: [triggers.scheduled({ schedule: "*/5 * * * *" })],
  },
});
