import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSources = [
    'adapters/AdaptersPage.tsx',
    'connections/ConnectionDetail.tsx',
    'destinations/DestinationCreate.tsx',
    'destinations/DestinationsList.tsx',
    'feeds/FeedDetail.tsx',
    'feeds/FeedsPage.tsx',
    'hooks/Hooks.tsx',
    'logs/Logs.tsx',
    'pipelines/ExportWizardPage.tsx',
    'pipelines/ImportWizardPage.tsx',
    'pipelines/PipelineDetail.tsx',
    'queues/QueuesPage.tsx',
    'schemas/SchemaDetail.tsx',
    'secrets/SecretDetail.tsx',
    'settings/Settings.tsx',
] as const;

const detailPageEntities = [
    ['connections/ConnectionDetail.tsx', 'entity={entity}'],
    ['feeds/FeedDetail.tsx', 'entity={feed}'],
    ['pipelines/PipelineDetail.tsx', 'entity={entity}'],
    ['schemas/SchemaDetail.tsx', 'entity={entity}'],
    ['secrets/SecretDetail.tsx', 'entity={entity}'],
] as const;

function count(source: string, pattern: RegExp): number {
    return source.match(pattern)?.length ?? 0;
}

describe('Vendure page layout contract', () => {
    it.each(pageSources)('%s gives every page state an accessible title', file => {
        const source = readFileSync(resolve(__dirname, file), 'utf8');
        expect(count(source, /<Page(?:\s|>)/g)).toBeGreaterThan(0);
        expect(count(source, /<PageTitle(?:\s|>)/g))
            .toBe(count(source, /<Page(?:\s|>)/g));
    });

    it.each(pageSources.filter(file => !file.endsWith('WizardPage.tsx')))(
        '%s places page blocks through Vendure PageLayout',
        file => {
            const source = readFileSync(resolve(__dirname, file), 'utf8');
            if (source.includes('<PageBlock')) {
                expect(source).toContain('<PageLayout>');
            }
        },
    );

    it('keeps the destination action bar outside its associated form', () => {
        const source = readFileSync(
            resolve(__dirname, 'destinations/DestinationCreate.tsx'),
            'utf8',
        );
        expect(source).toContain('form={DESTINATION_FORM_ID}');
        expect(source).toContain('<form id={DESTINATION_FORM_ID}');
    });

    it('routes pipeline run blocks through Vendure PageLayout', () => {
        const source = readFileSync(
            resolve(__dirname, 'pipelines/PipelineRunsBlock.tsx'),
            'utf8',
        );
        expect(source).toContain('<PageLayout>');
        expect(source).toContain('{content}');
    });

    it.each(detailPageEntities)('%s exposes its entity through Vendure PageContext', (
        file,
        entityProp,
    ) => {
        const source = readFileSync(resolve(__dirname, file), 'utf8');
        expect(source).toContain(entityProp);
    });
});
