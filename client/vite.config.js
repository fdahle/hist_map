// client/vite.config.js
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd());

  return {
    plugins: [vue()],
    define: {
      // This creates a global constant available everywhere
      __APP_DEBUG__: env.VITE_DEBUG_MODE === "true",
    },
  };
});
