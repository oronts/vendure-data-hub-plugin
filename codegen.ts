/**
 * GraphQL codegen + shared enum generation
 * Run: npm run codegen
 */

import type { CodegenConfig } from '@graphql-codegen/cli';
import { execSync } from 'child_process';

const config: CodegenConfig = {
    overwrite: true,
    schema: 'http://localhost:3000/admin-api',
    hooks: {
        beforeAllFileWrite: () => {
            console.log('🔄 Generating shared enums...');
            try {
                execSync('ts-node scripts/generate-shared-enums.ts', { stdio: 'inherit' });
            } catch (error) {
                console.error('⚠️  Failed to generate shared enums:', error);
            }
        },
    },
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
