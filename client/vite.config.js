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
    build: {
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            // three.js and @giro3d are the heaviest; isolate them for better caching
            if (id.includes('three') || id.includes('@giro3d')) return 'vendor-3d';
            // Everything else (ol, geotiff, proj4, vue, pinia …) in one stable vendor chunk
            return 'vendor';
          },
        },
      },
    },
    define: {
      // This creates a global constant available everywhere
      __APP_DEBUG__: env.VITE_DEBUG_MODE === "true",
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || "dev"),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
  };
});
