import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv, type ConfigEnv } from "vite";
import { publicCloudDefines } from "./lib/public-cloud-env";

export default (env: ConfigEnv) => {
  const publicEnv = loadEnv(env.mode, process.cwd(), "VITE_");
  return defineConfig({
    vite: {
      define: publicCloudDefines(publicEnv),
    },
    tanstackStart: {
      server: { entry: "server" },
    },
  })(env);
};
