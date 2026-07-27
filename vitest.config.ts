import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
    plugins: [
        swc.vite({
            jsc: {
                parser: {
                    syntax: 'typescript',
                    decorators: true,
                    tsx: true,
                },
                transform: {
                    legacyDecorator: true,
                    decoratorMetadata: true,
                    react: {
                        runtime: 'automatic',
                    },
                },
            },
        }),
    ],
    test: {
        include: [
            'src/**/*.spec.ts',
            'src/**/*.test.ts',
            'dashboard/**/*.spec.{ts,tsx}',
            'dev-server/**/*.spec.ts',
            'shared/**/*.spec.ts',
            'connectors/**/*.spec.ts',
        ],
        exclude: ['node_modules', 'dist', 'e2e'],
        testTimeout: 10000,
    },
});
