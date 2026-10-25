import { defineConfig } from "vitest/config";

// Pure-logic tests only (no react-native runtime). Modules under test must not
// import react-native; see src/core/backHandling.ts and src/core/startup.ts.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
