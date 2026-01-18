import js from "@eslint/js";
import eslintPluginAstro from "eslint-plugin-astro";
import globals from "globals";

export default [
  js.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    ignores: ["dist/", ".vercel/", ".astro/"],
  },
];
