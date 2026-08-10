import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Attachments are served from an authenticated API route, and `next/image`
    // fetches through an optimizer that runs on the *web* server — which holds
    // no session and would get a 401. So this one file uses a plain `<img>`.
    //
    // Stated here rather than as an `eslint-disable` comment on the tag. The
    // rule only exists in this config; lint-staged runs eslint from the repo
    // root, where the Next plugin is not loaded, and a disable comment naming a
    // rule that config has never heard of is itself an error. A file-scoped
    // override is invisible to the root run and says the same thing.
    files: ["components/chat/message-attachments.tsx"],
    rules: { "@next/next/no-img-element": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
