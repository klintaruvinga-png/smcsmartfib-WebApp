import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        "types/index": resolve(__dirname, "src/types/index.ts"),
        "client/index": resolve(__dirname, "src/client/index.ts"),
        "client/SniperClient": resolve(__dirname, "src/client/SniperClient.ts"),
        "client/errors": resolve(__dirname, "src/client/errors.ts"),
        "auth/index": resolve(__dirname, "src/auth/index.ts"),
        "utils/index": resolve(__dirname, "src/utils/index.ts"),
        "constants/index": resolve(__dirname, "src/constants/index.ts"),
        "mocks/index": resolve(__dirname, "src/mocks/index.ts"),
      },
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: [],
    },
    target: "es2020",
    sourcemap: true,
  },
});
