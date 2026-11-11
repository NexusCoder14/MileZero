import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, "../.."), "");
  const apiPort = env.API_PORT || "4000";
  const apiHost = env.API_HOST || "127.0.0.1";
  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: Number(env.WEB_PORT || 5173),
      strictPort: true,
      proxy: { "/api": { target: `http://${apiHost}:${apiPort}`, changeOrigin: false } }
    },
    build: { outDir: "dist", sourcemap: true, target: "es2022" }
  };
});
