import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // baomi 接口返回未类型化的 JSON，代理层刻意以 any 透传；
      // 强约束反而要求大量无意义的断言，故在本项目关闭该规则。
      "@typescript-eslint/no-explicit-any": "off",
      // fetch-on-mount 后 setState 是登录/入口页的正常模式，降级为提示。
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
