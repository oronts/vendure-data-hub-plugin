import { vendureDashboardPlugin } from '@vendure/dashboard/vite';
import { pathToFileURL } from 'url';
import { defineConfig, Plugin } from 'vite';
import { resolve, join } from 'path';

const dashboardRoot = join(__dirname, 'node_modules/@vendure/dashboard');

// Environment configuration with defaults
const API_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const API_HOST = process.env.API_HOST || 'http://localhost';
const VITE_DEV_PORT = process.env.VITE_DEV_PORT ? parseInt(process.env.VITE_DEV_PORT, 10) : 5173;

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
    server: {
        port: VITE_DEV_PORT,
        strictPort: false, // Allow fallback to next available port
        host: true, // Listen on all interfaces for container/remote access
    },
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
                host: API_HOST,
                port: API_PORT,
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
