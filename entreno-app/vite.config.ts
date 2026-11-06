import { defineConfig } from 'vite';

// Construcción como librería IIFE: React y ReactDOM se cargan desde cdnjs (globales UMD)
// y scripts/assemble.mjs genera un único HTML autocontenido.
export default defineConfig({
  esbuild: {
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    jsxInject: "import React from 'react'",
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: { entry: 'src/main.tsx', name: 'MenarguezFitIA', formats: ['iife'], fileName: () => 'app.js' },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client'],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' },
        assetFileNames: 'app.[ext]',
      },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
