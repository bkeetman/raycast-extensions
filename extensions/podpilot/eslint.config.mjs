import { defineConfig } from "eslint/config";
import raycast from "@raycast/eslint-config";

export default defineConfig([
  ...raycast,
  {
    ignores: ["dist/**", "node_modules/**", "output/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
