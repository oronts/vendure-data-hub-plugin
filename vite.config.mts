import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { lingui } from '@lingui/vite-plugin';
import { resolve } from 'path';

/**
 * Vite configuration for @vendure/data-hub-plugin dashboard
 *
 * This config builds the dashboard extension source as a standalone library
 * for bundle and module-boundary verification. Vendure consumers compile the
 * published dashboard source through vendureDashboardPlugin instead.
 *
 * Usage:
 *   npm run build:dashboard    - Production build
 *
 * Vendure integration build:
 *   npm run build:dev          - Build the complete Vendure dashboard
 */

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
    plugins: [
        react({
            babel: {
                plugins: ['@lingui/babel-plugin-lingui-macro'],
            },
        }),
        lingui(),
    ],
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
                '@tanstack/react-router',
                '@tanstack/react-table',
                'graphql',
                'graphql-request',
                'sonner',
                'lucide-react',
                '@xyflow/react',
                'virtual:vendure-ui-config',
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
            { find: '@', replacement: resolve(__dirname, 'dashboard') },
        ],
        dedupe: [
            'react',
            'react-dom',
            '@tanstack/react-query',
            '@tanstack/react-router',
            '@tanstack/react-table',
        ],
    },
    // Optimize dependencies
    optimizeDeps: {
        include: ['react', 'react-dom'],
        exclude: ['@vendure/dashboard', '@vendure/core'],
    },
});
