import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchemaReferenceSelector } from './SchemaReferenceSelector';

let canReadSchemas = true;
let selectorProps: Record<string, unknown> = {};

const schemaQuery = {
    data: {
        pages: [{
            items: [{
                schemaId: 'catalog.product',
                version: '1.1.0',
                compatibility: 'BACKWARD',
            }],
            totalItems: 1,
        }],
    },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
};

vi.mock('@lingui/react/macro', () => ({
    useLingui: () => ({
        t: (parts: TemplateStringsArray) => parts.join(''),
    }),
}));

vi.mock('@vendure/dashboard', () => ({
    usePermissions: () => ({
        hasPermissions: () => canReadSchemas,
    }),
}));

vi.mock('../../hooks', () => ({
    useInfiniteSchemaReferences: vi.fn(() => schemaQuery),
}));

vi.mock('../../hooks/use-debounced-value', () => ({
    useDebouncedValue: (value: unknown) => value,
}));

vi.mock('./SearchableReferenceSelector', () => ({
    SearchableReferenceSelector: (props: Record<string, unknown>) => {
        selectorProps = props;
        return createElement('div', { 'data-testid': 'schema-selector' });
    },
}));

describe('SchemaReferenceSelector', () => {
    beforeEach(() => {
        canReadSchemas = true;
        selectorProps = {};
    });

    it('renders exact schema versions and decodes the selected reference', () => {
        const onChange = vi.fn();

        renderToStaticMarkup(
            <SchemaReferenceSelector
                value={{ schemaId: 'catalog.product', version: '1.1.0' }}
                onChange={onChange}
            />,
        );

        expect(selectorProps.selectedLabel).toBe('catalog.product · 1.1.0');
        expect(selectorProps.options).toEqual([{
            value: 'catalog.product\u00001.1.0',
            label: 'catalog.product',
            description: '1.1.0 · BACKWARD',
        }]);

        const select = selectorProps.onValueChange as (value: string) => void;
        select('catalog.order\u00002.0.0');
        expect(onChange).toHaveBeenCalledWith({
            schemaId: 'catalog.order',
            version: '2.0.0',
        });
    });

    it('fails closed when the current administrator cannot read schemas', () => {
        canReadSchemas = false;

        renderToStaticMarkup(
            <SchemaReferenceSelector onChange={vi.fn()} />,
        );

        expect(selectorProps.isError).toBe(true);
        expect(selectorProps.onRetry).toBeUndefined();
        expect(selectorProps.errorMessage).toBe(
            'You do not have permission to view schemas',
        );
    });
});
