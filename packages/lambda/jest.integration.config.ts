import type { Config } from "jest"
import { createJsWithTsEsmPreset } from "ts-jest"

const defaultPreset = createJsWithTsEsmPreset({
  tsconfig: "./tsconfig.spec.json",
})

const config: Config = {
  ...defaultPreset,
  testRegex: ".*\\.integration\\.spec\\.tsx?$",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testEnvironment: "node",
}

export default config
