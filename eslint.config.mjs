import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const [nextCore, ...nextRest] = nextVitals;

const eslintConfig = defineConfig([
  {
    ...nextCore,
    rules: {
      ...nextCore.rules,
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  ...nextRest,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
