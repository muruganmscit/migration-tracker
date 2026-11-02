import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["src/test/setup.ts"],
      include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
      testTimeout: 20000,
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        // main.tsx only mounts the app; Reports.tsx is hidden and not routed (see App.tsx).
        exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/main.tsx", "src/pages/Reports.tsx", "src/**/*.d.ts"],
        reporter: ["text-summary", "text", "lcov", "html"],
        reportsDirectory: "coverage",
        thresholds: { lines: 85, statements: 85 },
      },
    },
  })
);
