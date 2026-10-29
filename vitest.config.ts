import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const alias = { "~": fileURLToPath(new URL("./src", import.meta.url)) };

// Not using vite.config.ts here: the React Router plugin is for app builds only.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          include: ["tests/unit/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/setup.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          environment: "node",
          globals: true,
          include: ["tests/db/**/*.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
