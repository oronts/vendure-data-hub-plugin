import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
    plugins: [
        swc.vite({
            jsc: {
                parser: {
                    syntax: 'typescript',
                    decorators: true,
                },
                transform: {
                    legacyDecorator: true,
                    decoratorMetadata: true,
                },
            },
        }),
    ],
    test: {
        include: ['e2e/**/*.e2e-spec.ts'],
        testTimeout: 60000,
        hookTimeout: 30000,
        pool: 'forks',
        poolOptions: {
            forks: {
                // Run each test file in its own fork for isolation
                singleFork: false,
            },
        },
        sequence: {
            hooks: 'list',
        },
        // Run test files sequentially to avoid port collision
        fileParallelism: false,
    },
});
