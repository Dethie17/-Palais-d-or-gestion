import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Le rendu complet de l'application (contexte + rehydratation
    // localStorage) dépasse les 5 s par défaut dès que la machine est
    // chargée : le timeout par défaut rendait la suite instable (tests
    // verts sur un poste calme, rouges sur un poste chargé). On tolère
    // du temps, pas des assertions plus laxistes.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
