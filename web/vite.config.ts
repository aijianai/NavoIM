import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const SERVER = "http://127.0.0.1:4000";

export default defineConfig(() => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@navo/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: SERVER, changeOrigin: true },
      "/uploads": { target: SERVER, changeOrigin: true },
      "/ws": { target: SERVER, ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
  },
}));
