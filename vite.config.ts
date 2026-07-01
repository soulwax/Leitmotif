import { defineConfig } from "vite";

// Vite config for the Leitmotif web frontend. Tauri serves this build; during
// development `vite dev` runs the UI (bridge calls no-op unless inside Tauri).
export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    // Never watch the Rust side. `src-tauri/target/` holds build artifacts (the
    // .pdb/.exe are locked by the compiler while it writes them), and watching
    // them crashes the dev server with EBUSY. The Rust half has its own rebuild
    // loop; the UI watcher must stay out of it.
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/target/**",
        "**/node_modules/**",
        "**/dist/**",
      ],
    },
  },
  // Tauri expects a relative base so the built assets load from the app bundle.
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
  },
});
