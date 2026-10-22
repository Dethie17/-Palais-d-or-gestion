import { defineConfig, type Plugin, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { componentTagger } from "lovable-tagger";
import path from "path";
import fs from "fs";

/**
 * API EN LOCAL — les fonctions `api/*` (format Vercel) servies par Vite.
 *
 * En production, `/api/...` est traité par Vercel. En local, Vite ne
 * connaissait aucune de ces routes : l'Espace ISM ne pouvait donc pas
 * créer un parent, importer une liste, ni ouvrir un accès AVANT de
 * déployer — c'est-à-dire sans pouvoir vérifier ce qu'on livre.
 *
 * Ce plugin monte les mêmes handlers sur le serveur de dev :
 *   - `api/auth/create-parent.ts` → POST /api/auth/create-parent
 *   - `api/auth/login-parent.ts`  → POST /api/auth/login-parent
 *   - etc.
 *
 * Les handlers reçoivent les objets `IncomingMessage` / `ServerResponse` de
 * Node — exactement ceux que Vite leur fournit — et lisent leurs secrets
 * dans `process.env`, que l'on remplit depuis le `.env.local`.
 *
 * ⚠ Uniquement en développement (`apply: 'serve'`) : en production, c'est
 * Vercel qui sert ces routes. Les secrets ne quittent jamais le poste.
 */
function apiDevServer(): Plugin {
  return {
    name: "oresto-api-dev-server",
    apply: "serve",
    configureServer(server) {
      // Les variables serveur (clé de service, secrets passerelle) ne sont
      // pas injectées par Vite dans le navigateur : on les met à part.
      const env = loadEnv(server.config.mode, process.cwd(), "");
      for (const [key, value] of Object.entries(env)) {
        if (value !== undefined && process.env[key] === undefined) {
          process.env[key] = value;
        }
      }

      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || "").split("?")[0];
        if (!url.startsWith("/api/")) return next();

        // Vercel mappe /api/foo/bar sur api/foo/bar.ts
        const relative = url.replace(/^\/api\//, "").replace(/^\/+/, "");
        const base = path.resolve(server.config.root, "api", relative);
        const candidates = [
          `${base}.ts`,
          path.join(base, "index.ts"),
        ];
        const file = candidates.find((candidate) => {
          try {
            return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
          } catch {
            return false;
          }
        });

        if (!file) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: false, error: `Route inconnue en local : ${url}` }));
          return;
        }

        try {
          const mod = await server.ssrLoadModule(file);
          const handler = mod.default;
          if (typeof handler !== "function") {
            throw new Error(`Aucun handler par défaut dans ${file}`);
          }
          await handler(req, res);
        } catch (error) {
          server.ssrFixStacktrace?.(error as Error);
          console.error(`[api] ${url} :`, error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, error: "Erreur serveur (développement)." }));
          }
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), apiDevServer(), mode === "development" && componentTagger()].filter(Boolean),
  server: {
    host: "::",
    port: 8080,
    strictPort: true,
    hmr: {
      overlay: false,
    },
  },
  preview: {
    port: 4173,
    host: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "es2020",
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          supabase: ["@supabase/supabase-js"],
          charts: ["recharts"],
          pdf: ["jspdf"],
          qr: ["qrcode.react", "html5-qrcode"],
        },
      },
    },
  },
}));
