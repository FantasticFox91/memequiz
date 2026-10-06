import { defineConfig } from 'tsup';

// ESM для Nuxt, CJS для Nest (api собирается в CommonJS)
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
