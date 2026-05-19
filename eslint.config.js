import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

// Flat config (ESLint 9). Lints the React/TS frontend only — Rust has
// clippy, Python has ruff (see sidecar/ruff.toml). Type-aware rules are
// intentionally off to keep lint fast and noise-free; `tsc` (strict) is the
// type gate. CLAUDE.md's "no any" is enforced here as an error.
export default tseslint.config(
  {
    ignores: [
      "dist",
      "src-tauri",
      "sidecar",
      "node_modules",
      "scripts",
      "**/*.config.js",
      "**/*.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      // tsconfig already has noUnusedLocals/Parameters — defer to tsc.
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
