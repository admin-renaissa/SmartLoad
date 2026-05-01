import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

// Workspace root `.env` when tests run from `apps/api`
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
