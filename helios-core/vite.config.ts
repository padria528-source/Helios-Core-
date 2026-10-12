/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5180 },
  preview: { host: '127.0.0.1', port: 5181 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        // One long-lived chunk for the 3D stack, so app changes do not invalidate it.
        manualChunks(id: string) {
          if (id.includes('node_modules') && /three|postprocessing|maath|n8ao/.test(id)) return 'three'
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
