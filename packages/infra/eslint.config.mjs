// @ts-check

import eslint from "@eslint/js"
import cdkPlugin from "eslint-cdk-plugin"
import eslintConfigPrettier from "eslint-config-prettier"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: ["eslint.config.mjs", "dist/**/*", "**/*.js", "**/*.d.ts"],
  },
  eslint.configs.recommended,
  tseslint.configs.strict,
  // @ts-expect-error
  cdkPlugin.configs.recommended,
  eslintConfigPrettier
)
