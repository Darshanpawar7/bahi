import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// GitHub Pages serves this app from /bahi/. Override with BASE_PATH for any other host.
export default defineConfig(({ command }) => ({
  base: process.env.BASE_PATH ?? (command === 'build' ? '/bahi/' : '/'),
  plugins: [react()],
  build: { target: 'es2022', sourcemap: false },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      // The numbers that must be right live in the domain layer; that is what coverage is enforced on.
      include: ['src/domain/**/*.ts'],
      exclude: ['src/domain/**/*.test.ts', 'src/domain/types.ts'],
      thresholds: { lines: 95, functions: 95, statements: 95, branches: 90 },
    },
  },
}));
