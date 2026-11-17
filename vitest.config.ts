import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    setupFiles: ['./tests/support/setup.ts'],
    // O primeiro banco PGlite de cada arquivo aplica as migrações; com cobertura e em paralelo pode passar de 10s.
    hookTimeout: 30_000,
    testTimeout: 15_000,
    env: { TZ: 'America/Sao_Paulo' },
    coverage: {
      provider: 'v8',
      include: ['src/modules/**', 'src/lib/**'],
      exclude: ['**/*.test.*', '**/*.tsx'],
      thresholds: {
        lines: 80,
        branches: 80,
        'src/modules/**/rules.ts': { lines: 95, branches: 95 },
        'src/modules/**/{service,actions}.ts': { lines: 85, branches: 80 },
      },
    },
  },
})
