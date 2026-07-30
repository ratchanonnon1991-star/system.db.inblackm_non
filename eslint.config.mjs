import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const [nextCore, ...nextRest] = nextVitals;

const eslintConfig = defineConfig([
  {
    ...nextCore,
    rules: {
      ...nextCore.rules,
      "react-hooks/set-state-in-effect": "warn",
      // Twice now a component has used a name it never declared as a prop --
      // configHost, then inline -- and shipped, because next's config leaves
      // this off and nothing else looks at it. Both were a blank screen on
      // click; both would have been one lint line.
      "no-undef": "error",
    },
  },
  ...nextRest,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
