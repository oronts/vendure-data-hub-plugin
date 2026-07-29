import { createElement, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
    AdvancedMapEditor,
    AdvancedTemplateEditor,
    AdvancedWhenEditor,
    MultiOperatorEditor,
} from '../AdvancedEditors';

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
    Button: ({
        children,
        variant: _variant,
        size: _size,
        ...props
    }: ButtonHTMLAttributes<HTMLButtonElement> & {
        children?: ReactNode;
        variant?: string;
        size?: string;
    }) => createElement('button', props, children),
    Card: ({ children, ...props }: { children?: ReactNode }) => createElement('section', props, children),
    CardContent: ({ children, ...props }: { children?: ReactNode }) => createElement('div', props, children),
    CardHeader: ({ children, ...props }: { children?: ReactNode }) => createElement('header', props, children),
    CardTitle: ({ children, ...props }: { children?: ReactNode }) => createElement('h2', props, children),
    Input: (props: Record<string, unknown>) => createElement('input', props),
    Label: ({ children, ...props }: { children?: ReactNode }) => createElement('label', props, children),
    Select: ({ children, value }: { children?: ReactNode; value?: string }) => (
        createElement('div', { 'data-select-value': value }, children)
    ),
    SelectContent: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    SelectItem: ({ children, value }: { children?: ReactNode; value: string }) => (
        createElement('div', { 'data-option-value': value }, children)
    ),
    SelectTrigger: ({ children, ...props }: { children?: ReactNode }) => createElement('button', props, children),
    SelectValue: ({ placeholder }: { placeholder?: string }) => createElement('span', null, placeholder),
    Switch: ({ checked, id }: { checked?: boolean; id?: string }) => (
        createElement('input', { checked, id, readOnly: true, type: 'checkbox' })
    ),
    Textarea: (props: Record<string, unknown>) => createElement('textarea', props),
}));

vi.mock('../../../../constants', () => ({
    getOperatorPlaceholder: () => 'value',
    MOVE_DIRECTION: { UP: 'up', DOWN: 'down' },
}));

vi.mock('../../../../hooks', () => ({
    useStableKeys: (items: unknown[], prefix: string) => items.map((_, index) => `${prefix}-${index}`),
}));

vi.mock('../../../../hooks/api/use-config-options', () => ({
    useComparisonOperators: () => ({
        isLoading: false,
        operators: [
            { value: 'gt', label: 'greater than', valueType: 'number' },
            { value: 'in', label: 'in list', valueType: 'array', example: '["A", "B"]' },
            { value: 'exists', label: 'exists', noValue: true },
            { value: 'regex', label: 'matches regex', valueType: 'regex', example: '^SKU-' },
        ],
    }),
}));

vi.mock('../OperatorCard', () => ({
    OperatorCard: () => createElement('div', null, 'Operator card'),
}));

describe('advanced editor components', () => {
    it('rejects non-object mappings and starts empty configs without persisted demo values', () => {
        const invalidMarkup = renderToStaticMarkup(
            <AdvancedMapEditor config={{ mapping: [] }} onChange={vi.fn()} />,
        );
        const emptyMarkup = renderToStaticMarkup(
            <AdvancedMapEditor config={{}} onChange={vi.fn()} />,
        );

        expect(invalidMarkup).toContain('Enter a valid JSON object for the mapping.');
        expect(invalidMarkup).toContain('aria-invalid="true"');
        expect(emptyMarkup).toContain('Include unmapped fields');
        expect(emptyMarkup).toContain('grid-cols-1');
        expect(emptyMarkup).not.toContain('&quot;title&quot;');
        expect(emptyMarkup).not.toContain('&quot;amount&quot;');
    });

    it('requires explicit template fields and exposes missing-value behavior', () => {
        const markup = renderToStaticMarkup(
            <AdvancedTemplateEditor config={{}} onChange={vi.fn()} />,
        );

        expect(markup).toContain('Template is required.');
        expect(markup).toContain('Enter a valid target path.');
        expect(markup).toContain('Treat missing fields as empty strings');
        expect(markup).toContain('grid-cols-1');
    });

    it('previews missing template values using the runtime default', () => {
        const markup = renderToStaticMarkup(
            <AdvancedTemplateEditor
                config={{ template: 'Product ${name} ${missing}', target: 'title' }}
                onChange={vi.fn()}
            />,
        );

        expect(markup).toContain('Product Alice ${missing}');
    });

    it('renders only the flat condition contract with metadata-driven value inputs', () => {
        const markup = renderToStaticMarkup(
            <AdvancedWhenEditor
                config={{
                    action: 'keep',
                    conditions: [
                        { field: 'price', cmp: 'gt', value: 10 },
                        { field: 'sku', cmp: 'in', value: 'invalid' },
                        { field: 'optional', cmp: 'exists', value: 'stale' },
                    ],
                }}
                onChange={vi.fn()}
            />,
        );

        expect(markup).toContain('Conditions');
        expect(markup).toContain('greater than');
        expect(markup).toContain('type="number"');
        expect(markup).toContain('Enter a JSON array for this operator.');
        expect(markup).toContain('No value required');
        expect(markup).toContain('sm:grid-cols-[');
        expect(markup).not.toContain('Combine groups');
        expect(markup).not.toContain('Add group');
    });

    it('reports unsupported grouped condition data instead of emitting it again', () => {
        const markup = renderToStaticMarkup(
            <AdvancedWhenEditor
                config={{ conditions: [{ logic: 'AND', rules: [] }] }}
                onChange={vi.fn()}
            />,
        );

        expect(markup).toContain('Nested condition groups are not supported by the when operator.');
        expect(markup).toContain('No conditions configured. Add a rule to filter records.');
    });

    it('does not offer an empty operator selector when no definitions are available', () => {
        const markup = renderToStaticMarkup(
            <MultiOperatorEditor operators={[]} availableOperators={[]} onChange={vi.fn()} />,
        );

        expect(markup).toContain('Add operator');
        expect(markup).toContain('disabled=""');
    });
});
