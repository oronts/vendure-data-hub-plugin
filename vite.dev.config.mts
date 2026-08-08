import { vendureDashboardPlugin } from '@vendure/dashboard/vite';
import { pathToFileURL } from 'url';
import { defineConfig } from 'vite';
import { resolve, join } from 'path';

const dashboardRoot = join(__dirname, 'node_modules/@vendure/dashboard');

// Environment configuration with defaults
const API_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const API_HOST = process.env.API_HOST || 'http://127.0.0.1';
const VITE_DEV_PORT = process.env.VITE_DEV_PORT ? parseInt(process.env.VITE_DEV_PORT, 10) : 5173;
const VITE_DEV_HOST = process.env.VITE_DEV_HOST || 'localhost';

export default defineConfig({
    base: '/admin',
    server: {
        port: VITE_DEV_PORT,
        strictPort: true,
        host: VITE_DEV_HOST,
    },
    build: {
        outDir: join(__dirname, 'dist/dashboard'),
        emptyOutDir: true,
    },
    plugins: [
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
        },
        dedupe: [
            'react',
            'react-dom',
            '@tanstack/react-query',
            '@tanstack/react-router',
            '@tanstack/react-table',
        ],
    },
});
