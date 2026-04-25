import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "e2e",
      "node_modules",
      "src/api/types.generated.ts",
      "src/ws/realtime.generated.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        AbortController: "readonly",
        Blob: "readonly",
        Buffer: "readonly",
        console: "readonly",
        document: "readonly",
        fetch: "readonly",
        File: "readonly",
        FormData: "readonly",
        Headers: "readonly",
        HTMLImageElement: "readonly",
        HTMLElement: "readonly",
        Image: "readonly",
        localStorage: "readonly",
        location: "readonly",
        navigator: "readonly",
        process: "readonly",
        ResizeObserver: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        window: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
);
