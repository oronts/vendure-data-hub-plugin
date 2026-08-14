import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PipelineSelector } from './PipelineSelector';

const hooks = vi.hoisted(() => ({
    useInfinitePipelines: vi.fn(),
    usePipeline: vi.fn(),
    hasPermissions: vi.fn(),
}));

vi.mock('../../hooks/api', () => hooks);

vi.mock('@lingui/react/macro', () => ({
    Trans: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
    useLingui: () => ({
        t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce(
            (result, part, index) => result + part + String(values[index] ?? ''),
            '',
        ),
    }),
}));

vi.mock('@vendure/dashboard', () => ({
    Button: ({ children }: { children?: ReactNode }) => createElement('button', null, children),
    buttonVariants: () => '',
    Command: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    CommandInput: () => createElement('input'),
    CommandItem: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    CommandList: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    Popover: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    PopoverContent: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    PopoverTrigger: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    usePermissions: () => ({ hasPermissions: hooks.hasPermissions }),
}));

vi.mock('lucide-react', async importOriginal => ({
    ...await importOriginal<typeof import('lucide-react')>(),
    Check: () => createElement('span'),
    ChevronsUpDown: () => createElement('span'),
    Loader2: () => createElement('span'),
    RefreshCw: () => createElement('span'),
}));

function pipelineListQuery(overrides: Record<string, unknown> = {}) {
    return {
        data: { pages: [{ items: [], totalItems: 0 }] },
        isLoading: false,
        isError: false,
        error: null,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
        refetch: vi.fn(),
        ...overrides,
    };
}

describe('PipelineSelector', () => {
    beforeEach(() => {
        hooks.hasPermissions.mockReturnValue(true);
        hooks.useInfinitePipelines.mockReturnValue(pipelineListQuery());
        hooks.usePipeline.mockReturnValue({
            data: null,
            isLoading: false,
            isError: false,
        });
    });

    it('hydrates a selected pipeline outside the loaded search page', () => {
        hooks.usePipeline.mockReturnValue({
            data: { id: '42', name: 'Catalog Sync', code: 'catalog-sync' },
            isLoading: false,
            isError: false,
        });

        const markup = renderToStaticMarkup(
            <PipelineSelector value="42" onValueChange={vi.fn()} />,
        );

        expect(markup).toContain('Catalog Sync (catalog-sync)');
        expect(hooks.usePipeline).toHaveBeenCalledWith('42');
    });

    it('keeps the all option while exposing a failed pipeline query', () => {
        hooks.useInfinitePipelines.mockReturnValue(pipelineListQuery({
            data: undefined,
            isError: true,
            error: new Error('denied'),
        }));

        const markup = renderToStaticMarkup(
            <PipelineSelector
                value="all"
                onValueChange={vi.fn()}
                allOption={{ value: 'all', label: 'All Pipelines' }}
            />,
        );

        expect(markup).toContain('All Pipelines');
        expect(markup).toContain('Could not load pipelines.');
        expect(markup).toContain('Retry');
        expect(hooks.usePipeline).toHaveBeenCalledWith(undefined);
    });

    it('suppresses pipeline requests and explains missing list permission', () => {
        const fetchNextPage = vi.fn();
        hooks.hasPermissions.mockReturnValue(false);
        hooks.useInfinitePipelines.mockReturnValue(pipelineListQuery({
            data: {
                pages: [{
                    items: [{
                        id: '42',
                        name: 'Cached confidential pipeline',
                        code: 'cached-confidential',
                    }],
                    totalItems: 2,
                }],
            },
            hasNextPage: true,
            fetchNextPage,
        }));
        hooks.usePipeline.mockReturnValue({
            data: {
                id: '42',
                name: 'Cached selected pipeline',
                code: 'cached-selected',
            },
            isLoading: false,
            isError: false,
        });

        const allMarkup = renderToStaticMarkup(
            <PipelineSelector
                value="all"
                onValueChange={vi.fn()}
                allOption={{ value: 'all', label: 'All Pipelines' }}
            />,
        );
        const selectedMarkup = renderToStaticMarkup(
            <PipelineSelector value="42" onValueChange={vi.fn()} />,
        );

        expect(allMarkup).toContain('All Pipelines');
        expect(selectedMarkup).toContain('Unavailable pipeline (42)');
        expect(selectedMarkup).toContain(
            'You do not have permission to list Data Hub pipelines.',
        );
        expect(selectedMarkup).not.toContain('Cached confidential pipeline');
        expect(selectedMarkup).not.toContain('Cached selected pipeline');
        expect(selectedMarkup).not.toContain('Load more');
        expect(selectedMarkup).not.toContain('Retry');
        expect(fetchNextPage).not.toHaveBeenCalled();
        expect(hooks.useInfinitePipelines).toHaveBeenLastCalledWith(
            expect.any(Object),
            false,
        );
        expect(hooks.usePipeline).toHaveBeenLastCalledWith(undefined);
    });
});
