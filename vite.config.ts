import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Served from https://alexanderottenhoff.github.io/tridentine-missal/ on GitHub
  // Pages, so assets need the repo-name prefix there. The deploy workflow sets
  // GITHUB_PAGES; local dev/preview stay at the root.
  base: process.env.GITHUB_PAGES ? "/tridentine-missal/" : "/",
  plugins: [react(), tailwindcss()],
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
