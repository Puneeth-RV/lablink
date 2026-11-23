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
    // Entry points only wire dependencies together; their logic is covered via createApp/App tests.
    coverage: { include: ['src/**'], exclude: ['src/server/index.ts', 'src/client/main.tsx', 'src/**/*.d.ts'], reporter: ['text-summary'] },
  },
});
