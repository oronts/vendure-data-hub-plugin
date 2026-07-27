import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
    overwrite: true,
    schema: 'schema.graphql',
    config: {
        strict: true,
        maybeValue: 'T',
        inputMaybeValue: 'T | undefined',
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
