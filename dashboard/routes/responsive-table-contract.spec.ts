import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const denseTableSources = [
    'adapters/AdapterDetail.tsx',
    'pipelines/RunErrorsList.tsx',
    'pipelines/StepSummaryTable.tsx',
    'pipelines/components/DryRunSummary.tsx',
    'queues/ConsumersTable.tsx',
    'queues/DeadLettersTable.tsx',
    'queues/FailedRunsTable.tsx',
    '../components/templates/TemplatePreview.tsx',
    '../components/wizards/import-wizard/PreviewStep.tsx',
    'logs/components/LogExplorerTab.tsx',
] as const;

describe('responsive table contract', () => {
    it.each(denseTableSources)('%s contains dense tables within a scroll boundary', file => {
        const source = readFileSync(resolve(__dirname, file), 'utf8');

        expect(source).toMatch(/overflow-x-auto[\s\S]*<table/);
        expect(source).toContain('<caption');
    });

    it('associates the pipeline counter table with its visible heading', () => {
        const source = readFileSync(
            resolve(__dirname, 'pipelines/StepCounters.tsx'),
            'utf8',
        );

        expect(source).toContain('id={headingId}');
        expect(source).toContain('aria-labelledby={headingId}');
    });
});
