import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Route handler stubs take params they don't use yet; `_`-prefix
      // marks that as intentional rather than dead code.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Emitted by withWorkflow() on every build; already self-ignored from git.
    "app/.well-known/workflow/**",
    // Single-file VM bundle emitted by `npm run build:runner`.
    ".runner/**",
  ]),
]);

export default eslintConfig;
