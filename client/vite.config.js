// client/vite.config.js
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd());

  return {
    plugins: [vue()],
    server: {
      watch: {
        usePolling: true,
        interval: 300,
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    worker: {
      format: "es",
    },
    define: {
      // This creates a global constant available everywhere
      __APP_DEBUG__: env.VITE_DEBUG_MODE === "true",
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || "dev"),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
  };
});
