import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, join } from 'path';
import { readdirSync, statSync } from 'fs';

/**
 * Vite configuration for @vendure/data-hub-plugin dashboard
 *
 * This config builds the dashboard extensions as a library that can be
 * consumed by the main Vendure dashboard.
 */

// Get all component entry points for the dashboard
function getDashboardEntries() {
    const dashboardDir = resolve(__dirname, 'dashboard');
    const entries: Record<string, string> = {
        'dashboard/index': resolve(dashboardDir, 'index.tsx'),
    };

    // Add component directories as separate entries for code splitting
    const componentDirs = ['components', 'pages', 'providers', 'hooks'];
    for (const dir of componentDirs) {
        const dirPath = join(dashboardDir, dir);
        try {
            const files = readdirSync(dirPath);
            for (const file of files) {
                const filePath = join(dirPath, file);
                const stat = statSync(filePath);
                if (stat.isDirectory()) {
                    const indexFile = join(filePath, 'index.ts');
                    try {
                        statSync(indexFile);
                        entries[`dashboard/${dir}/${file}/index`] = indexFile;
                    } catch {
                        // No index.ts, try index.tsx
                        const indexTsx = join(filePath, 'index.tsx');
                        try {
                            statSync(indexTsx);
                            entries[`dashboard/${dir}/${file}/index`] = indexTsx;
                        } catch {
                            // Skip directories without index files
                        }
                    }
                }
            }
        } catch {
            // Directory doesn't exist, skip
        }
    }

    return entries;
}

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
        // Generate sourcemaps for debugging
        sourcemap: true,
        // Minify for production
        minify: 'esbuild',
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
