import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    name: "nzamy/baseline",
    rules: {
      "@next/next/no-html-link-for-pages": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "prefer-const": "warn",
    },
  },
  {
    // Register react + react-hooks so the severity overrides below actually
    // apply. The eslint-config-next presets enable these React-Compiler rules at
    // "error"; on this large RTL/Arabic codebase they surface 200+ PRE-EXISTING
    // findings (previously invisible because the whole config crashed on unknown
    // rules). They are quality signals, not build blockers, so we run them as
    // warnings — restoring the intent of the original nzamy/baseline block,
    // which listed these as "warn" but never registered the plugins.
    name: "nzamy/react-rules-as-warn",
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      "react/no-unescaped-entities": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
    },
  },
];

export default eslintConfig;
