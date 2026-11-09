import { defineConfig } from 'vite';

// Construcción como librería IIFE con React incluido (sin scripts de terceros).
// scripts/assemble.mjs genera /entreno/index.html con app.<hash>.js y app.<hash>.css
// (compatibles con una CSP estricta), copia las fuentes y genera una versión de un solo archivo para Artifact.
export default defineConfig({
  esbuild: {
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    jsxInject: "import React from 'react'",
  },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: { entry: 'src/main.tsx', name: 'MenarguezFitIA', formats: ['iife'], fileName: () => 'app.js' },
    rollupOptions: { output: { assetFileNames: 'app.[ext]' } },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30000 },
});
