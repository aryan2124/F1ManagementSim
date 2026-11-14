import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

const git = (() => { try { return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return "dev"; } })();

export default defineConfig({
  plugins: [react()],
  define: { __BUILD__: JSON.stringify(`${git} ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`) },
  server: {
    port: 5173,
    // Forward league websocket/API traffic to `npm run dev:worker` (wrangler dev)
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", ws: true, changeOrigin: true },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
