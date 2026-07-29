import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TriggerSchemaFields } from './TriggerSchemaFields';

const resourceSelector = vi.hoisted(() => vi.fn());

vi.mock('../ResourceReferenceSelector', () => ({
    ResourceReferenceSelector: (props: { resource: string; value: string }) => {
        resourceSelector(props);
        return createElement('span', { 'data-resource': props.resource }, props.value);
    },
}));

vi.mock('@vendure/dashboard', () => ({
    Input: () => createElement('input'),
    Label: ({ children }: { children?: ReactNode }) => createElement('label', null, children),
    Switch: () => createElement('input', { type: 'checkbox' }),
    Select: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-select': true }, children),
    SelectContent: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    SelectItem: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
    SelectTrigger: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    SelectValue: () => createElement('span'),
}));

vi.mock('@lingui/react/macro', () => ({
    useLingui: () => ({
        t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce(
            (result, part, index) => result + part + String(values[index] ?? ''),
            '',
        ),
    }),
}));

describe('TriggerSchemaFields', () => {
    it.each(['connection', 'secret'] as const)(
        'renders %s metadata with the resource selector',
        resource => {
            const markup = renderToStaticMarkup(
                <TriggerSchemaFields
                    fields={[{
                        key: `${resource}Code`,
                        label: `${resource} code`,
                        type: resource,
                    }]}
                    values={{ [`${resource}Code`]: `${resource}-1` }}
                    onChange={vi.fn()}
                />,
            );

            expect(markup).toContain(`data-resource="${resource}"`);
            expect(markup).toContain(`${resource}-1`);
            expect(resourceSelector).toHaveBeenLastCalledWith(
                expect.objectContaining({ resource, value: `${resource}-1` }),
            );
        },
    );

    it('keeps static metadata options as a normal select', () => {
        const markup = renderToStaticMarkup(
            <TriggerSchemaFields
                fields={[{
                    key: 'queueType',
                    label: 'Queue type',
                    type: 'select',
                    options: [{ value: 'REDIS', label: 'Redis Streams' }],
                }]}
                values={{ queueType: 'REDIS' }}
                onChange={vi.fn()}
            />,
        );

        expect(markup).toContain('data-select="true"');
        expect(markup).toContain('Redis Streams');
    });
});
