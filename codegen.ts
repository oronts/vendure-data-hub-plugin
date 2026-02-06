/**
 * GraphQL Code Generation Configuration for DataHub Plugin
 *
 * Usage:
 * 1. Start dev server: npm run start
 * 2. Generate types: npm run codegen
 *
 * Or with watch mode:
 * npm run codegen:watch
 */

import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
    overwrite: true,
    schema: 'http://localhost:3000/admin-api',
    config: {
        strict: true,
        maybeValue: 'T',
        scalars: {
            ID: 'string | number',
            Money: 'number',
            DateTime: 'string',
            JSON: 'Record<string, unknown>',
            Upload: 'File',
        },
        namingConvention: {
            enumValues: 'keep',
        },
    },
    generates: {
        'src/gql/generated.ts': {
            plugins: ['typescript'],
        },
        'dashboard/gql/': {
            preset: 'client',
            documents: 'dashboard/**/*.{ts,tsx}',
            presetConfig: {
                fragmentMasking: false,
            },
        },
    },
};

export default config;
