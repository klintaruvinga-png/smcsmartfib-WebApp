import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  define: {
    __BUILD_ID__: JSON.stringify(process.env.VITE_BUILD_ID ?? "test"),
    __SCHEMA_VERSION__: JSON.stringify(process.env.VITE_SCHEMA_VERSION ?? "1"),
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.{js,mjs,ts}"],
    exclude: ["node_modules/**", "wordpress/_archive/**"],
  },
});
