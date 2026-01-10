import { vendureDashboardPlugin } from '@vendure/dashboard/vite';
import { pathToFileURL } from 'url';
import { defineConfig, Plugin } from 'vite';
import { resolve, join } from 'path';

const dashboardRoot = join(__dirname, 'node_modules/@vendure/dashboard');

// Plugin to resolve file:// URLs to regular paths
function resolveFileUrls(): Plugin {
    return {
        name: 'resolve-file-urls',
        resolveId(id) {
            if (id.startsWith('file://')) {
                const path = id.replace('file://', '');
                return path;
            }
            return null;
        },
    };
}

export default defineConfig({
    base: '/admin',
    build: {
        outDir: join(__dirname, 'dist/dashboard'),
        emptyOutDir: true,
        rollupOptions: {
            // Ensure React is not duplicated - use single instance from dashboard
            external: [],
        },
    },
    plugins: [
        resolveFileUrls(),
        vendureDashboardPlugin({
            vendureConfigPath: pathToFileURL(join(__dirname, 'vendure-config.dev.ts')),
            api: {
                host: 'http://localhost',
                port: 3000,
            },
            gqlOutputPath: join(__dirname, 'dev-server/gql'),
        }),
    ],
    resolve: {
        alias: {
            '@/gql': resolve(__dirname, 'dev-server/gql/graphql.ts'),
            '/src/app/main.jsx': join(dashboardRoot, 'src/app/main.tsx'),
            // Force single React instance from dashboard
            'react': join(dashboardRoot, 'node_modules/react'),
            'react-dom': join(dashboardRoot, 'node_modules/react-dom'),
            'react/jsx-runtime': join(dashboardRoot, 'node_modules/react/jsx-runtime'),
            'react/jsx-dev-runtime': join(dashboardRoot, 'node_modules/react/jsx-dev-runtime'),
        },
        dedupe: ['react', 'react-dom'],
    },
});
