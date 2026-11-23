import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  build: { outDir: '../../dist/client', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:8080' } },
  test: {
    root: '.',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    coverage: { include: ['src/**'], reporter: ['text-summary'] },
  },
});
