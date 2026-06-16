// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(process.env.VITE_BUILD_ID ?? 'dev'),
    __SCHEMA_VERSION__: JSON.stringify(process.env.VITE_SCHEMA_VERSION ?? '1'),
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.{js,mjs,ts}"],
    exclude: ["node_modules/**", "wordpress/_archive/**"],
  },
});
