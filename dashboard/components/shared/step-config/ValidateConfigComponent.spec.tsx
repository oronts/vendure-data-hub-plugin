import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ValidateConfigComponent } from './ValidateConfigComponent';

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
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
        createElement('button', props, children),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
        createElement('input', props),
    Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) =>
        createElement('label', props, children),
    Select: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    SelectContent: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    SelectItem: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
    SelectTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
        createElement('button', props, children),
    SelectValue: ({ placeholder }: { placeholder?: ReactNode }) => createElement('span', null, placeholder),
    Switch: ({
        onCheckedChange: _onCheckedChange,
        ...props
    }: React.InputHTMLAttributes<HTMLInputElement> & {
        onCheckedChange?: (checked: boolean) => void;
    }) => createElement('input', { ...props, type: 'checkbox', readOnly: true }),
    Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
        createElement('textarea', props),
}));

vi.mock('lucide-react', () => ({
    Plus: () => createElement('span'),
    Trash2: () => createElement('span'),
}));

vi.mock('../../../hooks/api/use-config-options', () => ({
    useOptionValues: () => ({
        options: [{ value: 'FAIL_FAST', label: 'Fail fast' }],
    }),
    useValidationRuleSchemas: () => ({
        schemas: [{
            value: 'REQUIRED',
            label: 'Required',
            fields: [],
            defaultValues: { required: true },
        }],
    }),
}));

vi.mock('../../../hooks/use-stable-keys', () => ({
    useStableIndexIds: (items: unknown[]) => items.map((_, index) => `rule-${index}`),
}));

describe('ValidateConfigComponent rule contract', () => {
    it('renders every runtime-supported business-rule constraint', () => {
        const markup = renderToStaticMarkup(
            <ValidateConfigComponent
                config={{
                    rules: [{
                        type: 'business',
                        spec: {
                            field: 'sku',
                            required: true,
                            type: 'string',
                            min: 1,
                            max: 20,
                            minLength: 3,
                            maxLength: 12,
                            pattern: '^[A-Z]+$',
                            enum: ['DRAFT', 'ACTIVE'],
                            error: 'Enter a valid SKU',
                        },
                    }],
                }}
                onChange={vi.fn()}
            />,
        );

        for (const label of [
            'Field',
            'Value type',
            'Required',
            'Minimum value',
            'Maximum value',
            'Minimum length',
            'Maximum length',
            'Pattern',
            'Allowed values',
            'Error message',
        ]) {
            expect(markup).toContain(label);
        }
        expect(markup).toContain('Enter a valid SKU');
        expect(markup).toContain('DRAFT');
        expect(markup).toContain('ACTIVE');
    });

    it('warns when an unsupported rule field prevents publication', () => {
        const markup = renderToStaticMarkup(
            <ValidateConfigComponent
                config={{
                    rules: [{
                        type: 'business',
                        spec: { field: 'sku', legacyFormat: 'uppercase' },
                    }],
                }}
                onChange={vi.fn()}
            />,
        );

        expect(markup).toContain('unsupported fields prevent pipeline publication');
        expect(markup).toContain('legacyFormat');
    });
});
