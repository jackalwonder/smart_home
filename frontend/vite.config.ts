import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendProxyTarget = process.env.VITE_BACKEND_PROXY_TARGET || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: backendProxyTarget,
        changeOrigin: true,
      },
      "/ws": {
        target: backendProxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
