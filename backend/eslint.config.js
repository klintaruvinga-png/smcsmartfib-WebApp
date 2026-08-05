import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Backend-scoped ESLint flat config (Nitro + Drizzle + h3).
// Mirrors the repo-root prettier rules; drops the React-specific plugins
// (react-hooks/react-refresh) that the frontend config uses but the backend
// does not need.
export default tseslint.config(
  {
    ignores: ["dist", ".output", "node_modules", "supabase", "scripts/benchmark-pbkdf2.ts"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
