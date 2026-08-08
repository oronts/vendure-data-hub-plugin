import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntitySelector } from './EntitySelector';

const queries = vi.hoisted(() => ({
    useEntityLoaders: vi.fn(),
    useEntityFieldSchemas: vi.fn(),
}));

vi.mock('../../../hooks/api/use-entity-loaders', () => ({
    useEntityLoaders: queries.useEntityLoaders,
}));

vi.mock('../../../hooks/api/use-entity-field-schemas', () => ({
    useEntityFieldSchemas: queries.useEntityFieldSchemas,
}));

vi.mock('@vendure/dashboard', () => ({
    Badge: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));

vi.mock('@lingui/react/macro', () => ({
    useLingui: () => ({
        t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce(
            (result, part, index) => result + part + String(values[index] ?? ''),
            '',
        ),
    }),
}));

vi.mock('lucide-react', async importOriginal => ({
    ...await importOriginal<typeof import('lucide-react')>(),
    Check: () => createElement('span'),
}));

vi.mock('../feedback', () => ({
    LoadingState: ({ message }: { message: string }) => createElement('div', null, message),
    ErrorState: ({ title, message }: { title: string; message: string }) => createElement('div', null, title, message),
    EmptyState: ({ title, description }: { title: string; description: string }) => createElement('div', null, title, description),
}));

function entityQuery(overrides: Record<string, unknown> = {}) {
    return {
        entities: [],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        ...overrides,
    };
}

function fieldQuery(overrides: Record<string, unknown> = {}) {
    return {
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        getFields: vi.fn(() => []),
        ...overrides,
    };
}

describe('EntitySelector', () => {
    beforeEach(() => {
        queries.useEntityLoaders.mockReturnValue(entityQuery());
        queries.useEntityFieldSchemas.mockReturnValue(fieldQuery());
    });

    it('shows loading without static entity choices', () => {
        queries.useEntityLoaders.mockReturnValue(entityQuery({ isLoading: true }));

        const markup = renderToStaticMarkup(
            <EntitySelector value="" onChange={vi.fn()} />,
        );

        expect(markup).toContain('Loading entity catalog');
        expect(markup).not.toContain('datahub-entityselector-entity-');
    });

    it('shows backend errors instead of static entity choices', () => {
        queries.useEntityFieldSchemas.mockReturnValue(fieldQuery({
            isError: true,
            error: new Error('forbidden'),
        }));

        const markup = renderToStaticMarkup(
            <EntitySelector value="" onChange={vi.fn()} />,
        );

        expect(markup).toContain('Entity catalog unavailable');
        expect(markup).toContain('forbidden');
        expect(markup).not.toContain('datahub-entityselector-entity-');
    });

    it('keeps a legitimate empty registry empty', () => {
        const markup = renderToStaticMarkup(
            <EntitySelector value="" onChange={vi.fn()} />,
        );

        expect(markup).toContain('No supported entities');
        expect(markup).not.toContain('datahub-entityselector-entity-');
    });
});
