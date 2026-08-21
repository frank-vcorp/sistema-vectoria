/* eslint-env node */
"use strict";

/**
 * ESLint config manual (.eslintrc.cjs) sin eslint-config-next.
 *
 * eslint-config-next 14.x require @rushstack/eslint-patch/modern-module-resolution,
 * pero esa versión del patch no reconoce el caller en pnpm + ESLint 8.57
 * ("Failed to patch ESLint because the calling module was not recognized").
 *
 * Esta config monta los mismos plugins manualmente para evitar el patch.
 */
module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  plugins: [
    "@typescript-eslint",
    "react",
    "react-hooks",
    "jsx-a11y",
    "import",
    "@next/next",
  ],
  settings: {
    react: { version: "detect" },
    "import/resolver": {
      typescript: { alwaysTryTypes: true },
      node: { extensions: [".js", ".jsx", ".ts", ".tsx"] },
    },
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",
    "plugin:@next/next/recommended",
  ],
  ignorePatterns: [
    "node_modules/",
    ".next/",
    "dist/",
    "drizzle/",
    "public/",
    "next-env.d.ts",
    "e2e/playwright-report/",
    "e2e/test-results/",
    "*.config.js",
    "*.config.cjs",
    "*.config.mjs",
    "*.config.ts",
    "scripts/",
    "drizzle.config.ts",
    "playwright.config.ts",
    "vitest.config.ts",
    "postcss.config.mjs",
    "tailwind.config.ts",
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_" },
    ],
    "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "react/no-unknown-property": "off",
    "react/jsx-no-target-blank": "off",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "import/no-anonymous-default-export": "warn",
    "jsx-a11y/alt-text": [
      "warn",
      { elements: ["img"], img: ["Image"] },
    ],
    "jsx-a11y/aria-props": "warn",
    "jsx-a11y/aria-proptypes": "warn",
    "jsx-a11y/aria-unsupported-elements": "warn",
    "jsx-a11y/role-has-required-aria-props": "warn",
    "jsx-a11y/role-supports-aria-props": "warn",
    "@next/next/no-html-link-for-pages": "warn",
  },
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      parserOptions: {
        project: false,
      },
    },
  ],
};