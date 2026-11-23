import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { spawn } from "child_process";
import { componentTagger } from "lovable-tagger";

/** Starts the local AI service (local-ai/) alongside the dev server, so players need no extra step. */
function localAiService(): Plugin {
  return {
    name: "local-ai-service",
    apply: "serve",
    configureServer(server) {
      if (process.env.LOCAL_AI_AUTOSTART === "false") return;
      // Only when the dev server really listens (vite-node also loads this config but never listens)
      server.httpServer?.once("listening", () => {
        const child = spawn(
          process.execPath,
          [path.resolve(__dirname, "node_modules/vite-node/vite-node.mjs"), "local-ai/main.ts"],
          {
            cwd: __dirname,
            // IPC channel: closing it lets the service stop its private Ollama cleanly on every platform
            stdio: ["inherit", "inherit", "inherit", "ipc"],
            env: { ...process.env, LOCAL_AI_AUTOSTART: "false", LOCAL_AI_DEBUG: process.env.LOCAL_AI_DEBUG ?? "true" },
          },
        );
        const stop = () => {
          if (child.connected) child.disconnect();
        };
        server.httpServer?.once("close", stop);
        process.once("exit", stop);
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    watch: {
      // Large AI runtime/model files: watching them is useless and Windows locks them while they are written
      ignored: ["**/local-ai/runtime/**", "**/local-ai/models/**"],
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), localAiService()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
