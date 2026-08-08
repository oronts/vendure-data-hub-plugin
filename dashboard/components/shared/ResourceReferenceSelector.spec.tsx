import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceReferenceSelector } from './ResourceReferenceSelector';

const mocks = vi.hoisted(() => ({
    hasPermissions: vi.fn(),
    useInfiniteConnectionReferences: vi.fn(),
    useInfiniteSecretReferences: vi.fn(),
    selectorProps: vi.fn(),
}));

vi.mock('@vendure/dashboard', () => ({
    usePermissions: () => ({ hasPermissions: mocks.hasPermissions }),
}));

vi.mock('@lingui/react/macro', () => ({
    useLingui: () => ({
        t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce(
            (result, part, index) => result + part + String(values[index] ?? ''),
            '',
        ),
    }),
}));

vi.mock('../../hooks/api', () => ({
    useInfiniteConnectionReferences: mocks.useInfiniteConnectionReferences,
    useInfiniteSecretReferences: mocks.useInfiniteSecretReferences,
}));

vi.mock('../../hooks/use-debounced-value', () => ({
    useDebouncedValue: (value: string) => value,
}));

vi.mock('./SearchableReferenceSelector', () => ({
    SearchableReferenceSelector: (props: Record<string, unknown>) => {
        mocks.selectorProps(props);
        return createElement(
            'div',
            null,
            String(props.selectedLabel),
            String(props.errorMessage),
        );
    },
}));

function referenceQuery() {
    return {
        data: { pages: [{ items: [], totalItems: 0 }] },
        isLoading: false,
        isError: false,
        hasNextPage: false,
        isFetchingNextPage: false,
        refetch: vi.fn(),
        fetchNextPage: vi.fn(),
    };
}

describe('ResourceReferenceSelector', () => {
    beforeEach(() => {
        mocks.hasPermissions.mockReturnValue(true);
        mocks.useInfiniteConnectionReferences.mockReturnValue(referenceQuery());
        mocks.useInfiniteSecretReferences.mockReturnValue(referenceQuery());
    });

    it('preserves the configured code when it is outside the loaded page', () => {
        const markup = renderToStaticMarkup(
            <ResourceReferenceSelector
                resource="connection"
                value="warehouse-db"
                onValueChange={vi.fn()}
            />,
        );

        expect(markup).toContain('warehouse-db');
        expect(mocks.selectorProps).toHaveBeenLastCalledWith(
            expect.objectContaining({
                selectedLabel: 'warehouse-db',
                isError: false,
            }),
        );
    });

    it('forwards accessible trigger attributes', () => {
        renderToStaticMarkup(
            <ResourceReferenceSelector
                id="connection-code"
                aria-labelledby="connection-code-label"
                aria-describedby="connection-code-help"
                aria-required
                resource="connection"
                value="warehouse-db"
                onValueChange={vi.fn()}
            />,
        );

        expect(mocks.selectorProps).toHaveBeenLastCalledWith(
            expect.objectContaining({
                id: 'connection-code',
                'aria-labelledby': 'connection-code-label',
                'aria-describedby': 'connection-code-help',
                'aria-required': true,
            }),
        );
    });

    it('exposes missing permission without issuing an enabled secret query', () => {
        mocks.hasPermissions.mockReturnValue(false);

        const markup = renderToStaticMarkup(
            <ResourceReferenceSelector
                resource="secret"
                value="api-key"
                onValueChange={vi.fn()}
            />,
        );

        expect(markup).toContain('permission to list Data Hub secrets');
        expect(mocks.useInfiniteSecretReferences).toHaveBeenCalledWith('', false);
        expect(mocks.selectorProps).toHaveBeenLastCalledWith(
            expect.objectContaining({
                isError: true,
                onRetry: undefined,
            }),
        );
    });
});
