import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PipelineActionButtons } from './PipelineActionButtons';

vi.mock('@lingui/react/macro', () => ({
    Trans: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
    useLingui: () => ({
        t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce(
            (message, part, index) => `${message}${part}${String(values[index] ?? '')}`,
            '',
        ),
    }),
}));

vi.mock('@vendure/dashboard', () => ({
    Button: ({
        children,
        ...props
    }: {
        children?: ReactNode;
        [key: string]: unknown;
    }) => createElement('button', props, children),
    PermissionGuard: ({
        children,
        requires,
    }: {
        children?: ReactNode;
        requires: string[];
    }) => createElement('section', {
        'data-guard': 'any',
        'data-requires': requires.join(','),
    }, children),
}));

vi.mock('lucide-react', async importOriginal => {
    const actual = await importOriginal<typeof import('lucide-react')>();
    return {
        ...actual,
        FlaskConical: () => createElement('span'),
        History: () => createElement('span'),
        Play: () => createElement('span'),
    };
});

vi.mock('../../../components/pipelines/PipelineImport', () => ({
    PipelineImportDialog: () => createElement('span', null, 'Import'),
}));

vi.mock('../../../components/pipelines/PipelineExport', () => ({
    PipelineExportDialog: () => createElement('span', null, 'Export'),
}));

vi.mock('../../../components/shared', () => ({
    AllPermissionsGuard: ({
        children,
        requires,
    }: {
        children?: ReactNode;
        requires: string[];
    }) => createElement('section', {
        'data-guard': 'all',
        'data-requires': requires.join(','),
    }, children),
}));

vi.mock('../../../hooks', () => ({
    useRunPipeline: () => ({
        isPending: false,
        mutate: vi.fn(),
    }),
}));

function render(
    overrides: Partial<Parameters<typeof PipelineActionButtons>[0]> = {},
): string {
    return renderToStaticMarkup(
        <PipelineActionButtons
            entityId="3"
            status="PUBLISHED"
            enabled
            currentRevisionId="17"
            publishedVersionCount={4}
            definition={{
                version: 1,
                capabilities: { requires: ['UpdateCatalog'] },
                steps: [],
            }}
            creating={false}
            hasUnsavedChanges={false}
            managedByCodeFirst={false}
            onImport={vi.fn()}
            onOpenDryRun={vi.fn()}
            onOpenHistory={vi.fn()}
            {...overrides}
        />,
    );
}

describe('PipelineActionButtons active revision UX', () => {
    it('hides source import while a pipeline is managed by code-first configuration', () => {
        const markup = render({ managedByCodeFirst: true });

        expect(markup).not.toContain('Import');
        expect(markup).toContain('Export');
        expect(markup).toContain('Run published v4');
    });

    it('keeps production run available for dirty drafts and pins the visible version', () => {
        const markup = render({
            status: 'DRAFT',
            hasUnsavedChanges: true,
        });

        expect(markup).toContain('<span>Run published v4</span>');
        expect(markup).toMatch(
            /<button(?=[^>]*data-testid="pipeline-run-now-button")[^>]*>/,
        );
        expect(markup).not.toMatch(
            /<button(?=[^>]*data-testid="pipeline-run-now-button")(?=[^>]*disabled)[^>]*>/,
        );
        expect(markup).toMatch(
            /<button(?=[^>]*data-testid="pipeline-dry-run-button")(?=[^>]*disabled)[^>]*>/,
        );
    });

    it.each([
        { status: 'ARCHIVED' as const, enabled: false, currentRevisionId: '17' },
        { status: 'PUBLISHED' as const, enabled: false, currentRevisionId: '17' },
        { status: 'DRAFT' as const, enabled: true, currentRevisionId: null },
    ])('disables production run for a non-runnable pipeline', state => {
        const markup = render(state);

        expect(markup).toMatch(
            /<button(?=[^>]*data-testid="pipeline-run-now-button")(?=[^>]*disabled)[^>]*>/,
        );
    });

    it('requires every execution permission for dry and production runs', () => {
        const markup = render();

        expect(markup.match(/data-guard="all"/g)).toHaveLength(2);
        expect(
            markup.match(/data-requires="RunDataHubPipeline,UpdateCatalog"/g),
        ).toHaveLength(2);
    });
});
