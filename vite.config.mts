import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vite configuration for @vendure/data-hub-plugin dashboard
 *
 * This config builds the dashboard extensions as a library that can be
 * consumed by the main Vendure dashboard.
 *
 * Usage:
 *   npm run build:dashboard    - Production build
 *
 * For development, use vite.dev.config.mts instead:
 *   npm run build:dev          - Dev server build with HMR
 */

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
    plugins: [react()],
    build: {
        outDir: resolve(__dirname, '.dashboard-build'),
        emptyOutDir: true,
        lib: {
            entry: resolve(__dirname, 'dashboard/index.tsx'),
            formats: ['es'],
            fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
        },
        rollupOptions: {
            // Externalize dependencies that will be provided by the host application
            external: [
                'react',
                'react-dom',
                'react/jsx-runtime',
                '@vendure/dashboard',
                '@vendure/core',
                '@tanstack/react-query',
                'graphql',
                'graphql-request',
                'sonner',
                'lucide-react',
                '@xyflow/react',
                /^@radix-ui\/.*/,
            ],
            output: {
                // Preserve module structure for tree-shaking
                preserveModules: true,
                preserveModulesRoot: 'dashboard',
                entryFileNames: '[name].js',
                chunkFileNames: 'chunks/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash][extname]',
                // Provide global variables for externals in UMD build
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM',
                    'react/jsx-runtime': 'jsxRuntime',
                    '@vendure/dashboard': 'VendureDashboard',
                },
            },
        },
        // Generate sourcemaps for debugging (always for dev, conditional for prod)
        sourcemap: !isProduction || process.env.GENERATE_SOURCEMAP === 'true',
        // Minify for production only
        minify: isProduction ? 'esbuild' : false,
        // Target modern browsers
        target: 'es2020',
    },
    resolve: {
        alias: [
            { find: '@/gql', replacement: resolve(__dirname, 'dashboard/gql/index.ts') },
            { find: /^@\/vdb\/(.*)$/, replacement: '@vendure/dashboard/src/$1' },
            { find: '@', replacement: resolve(__dirname, 'dashboard') },
        ],
    },
    // Optimize dependencies
    optimizeDeps: {
        include: ['react', 'react-dom'],
        exclude: ['@vendure/dashboard', '@vendure/core'],
    },
});
