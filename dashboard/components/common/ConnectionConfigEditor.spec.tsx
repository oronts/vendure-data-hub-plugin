import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONNECTION_TYPE } from '../../constants';
import { ConnectionConfigEditor } from './ConnectionConfigEditor';

const hooks = vi.hoisted(() => ({
    useConnectionSchemas: vi.fn(),
    useOptionValues: vi.fn(),
}));

vi.mock('../../hooks/api/use-config-options', () => hooks);

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
    Button: ({ children, ...props }: { children?: ReactNode }) => (
        createElement('button', props, children)
    ),
    Input: (props: Record<string, unknown>) => createElement('input', props),
    Label: ({ children, ...props }: { children?: ReactNode }) => (
        createElement('label', props, children)
    ),
    Switch: (props: Record<string, unknown>) => createElement('input', {
        ...props,
        type: 'checkbox',
    }),
    Textarea: (props: Record<string, unknown>) => createElement('textarea', props),
}));

vi.mock('lucide-react', async importOriginal => ({
    ...await importOriginal<typeof import('lucide-react')>(),
    PlusCircle: () => createElement('span'),
    Trash2: () => createElement('span'),
}));

describe('ConnectionConfigEditor', () => {
    beforeEach(() => {
        hooks.useConnectionSchemas.mockReturnValue({
            schemas: [],
            isLoading: true,
        });
        hooks.useOptionValues.mockReturnValue({
            options: [],
            isLoading: true,
        });
    });

    it('renders the default HTTP form while backend metadata is loading', () => {
        const markup = renderToStaticMarkup(
            <ConnectionConfigEditor
                type={CONNECTION_TYPE.HTTP}
                config={{}}
                onChange={vi.fn()}
            />,
        );

        expect(markup).toContain('Base URL');
        expect(markup).toContain('https://api.example.com');
        expect(markup).toContain('Authentication');
        expect(markup).not.toContain('No configuration required.');
    });

    it('renders a custom JSON object without string coercion', () => {
        hooks.useConnectionSchemas.mockReturnValue({
            schemas: [{
                type: CONNECTION_TYPE.CUSTOM,
                label: 'Custom',
                fields: [{
                    key: 'config',
                    label: 'Configuration',
                    type: 'json',
                }],
            }],
            isLoading: false,
        });

        const markup = renderToStaticMarkup(
            <ConnectionConfigEditor
                type={CONNECTION_TYPE.CUSTOM}
                config={{ config: { endpoint: 'https://example.com' } }}
                onChange={vi.fn()}
            />,
        );

        expect(markup).toContain('<textarea');
        expect(markup).toContain('&quot;endpoint&quot;');
        expect(markup).not.toContain('[object Object]');
    });
});
