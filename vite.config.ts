import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('./plugin.json', import.meta.url), 'utf-8'))

export default defineConfig({
    plugins: [svelte({ compilerOptions: { css: 'injected' } })],
    resolve: {
        alias: {
            '@tauri-apps/api': resolve(__dirname, '../../issh-tauri/node_modules/@tauri-apps/api'),
        },
    },
    build: {
        lib: {
            entry: resolve(__dirname, 'index.ts'),
            formats: ['es'],
            fileName: () => manifest.entry,
        },
        rollupOptions: {
            external: [],
        },
        outDir: 'dist',
        emptyOutDir: true,
        target: 'es2022',
        minify: false,
    },
})
