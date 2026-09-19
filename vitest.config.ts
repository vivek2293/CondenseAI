import { defineConfig } from "vitest/config";

export default defineConfig({
  // Isolated from vite.config.ts so @crxjs/vite-plugin does not load into the test runner.
  plugins: [],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // forks/threads hit a Vitest 4.1.x runner-context bug on this Windows setup
    // ("Cannot read properties of undefined (reading 'config')").
    pool: "vmThreads",
  },
});
