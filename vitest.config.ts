import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.{js,ts}', '**/*.test.{js,ts}'],
    exclude: ['node_modules', '.next'],
  },
})
