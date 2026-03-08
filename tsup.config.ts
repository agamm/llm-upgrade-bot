import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/core/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
  },
  {
    entry: { cli: 'src/cli/index.ts' },
    format: ['esm'],
    banner: {
      js: '#!/usr/bin/env node\nimport { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
    },
    sourcemap: true,
    noExternal: [/.*/],
  },
])
