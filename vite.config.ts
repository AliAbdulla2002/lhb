import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const clientDir = fileURLToPath(new URL("./build/client", import.meta.url));

/**
 * `vite preview` parity with production hosting: serve prerendered pages as-is and
 * every other route from the SPA fallback (not the prerendered home page, which would
 * break hydration). Hosting must apply the same rewrite — see docs/DEPLOYMENT.md.
 */
function spaFallbackPreview(): Plugin {
  return {
    name: "lahab:spa-fallback-preview",
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = (req.url ?? "/").split("?")[0]!;
        const isFile = /\.[a-z0-9]+$/i.test(path);
        const prerendered = existsSync(join(clientDir, path, "index.html"));
        if (!isFile && !prerendered && req.headers.accept?.includes("text/html")) req.url = "/__spa-fallback.html";
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), spaFallbackPreview()],
  resolve: {
    alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5173 },
});
