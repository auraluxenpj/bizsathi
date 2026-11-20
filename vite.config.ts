import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type ConfigEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { publicCloudDefines } from "./lib/public-cloud-env";

export default defineConfig((env: ConfigEnv) => {
  const publicEnv = loadEnv(env.mode, process.cwd(), "VITE_");

  return {
    define: publicCloudDefines(publicEnv),
    plugins: [
      cloudflare(),
      tailwindcss(),
      tsconfigPaths(),
      tanstackStart({
        server: { entry: "server" },
      }),
      react(),
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    server: {
      host: "::",
      port: 8080,
      watch: {
        awaitWriteFinish: {
          stabilityThreshold: 1000,
          pollInterval: 100,
        },
      },
    },
  };
});
