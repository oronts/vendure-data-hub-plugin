import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StepConfigPanel } from './StepConfigPanel';

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
    Input: () => createElement('input'),
    Card: ({ children }: { children?: ReactNode }) => createElement('section', null, children),
    CardContent: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    CardHeader: ({ children }: { children?: ReactNode }) => createElement('header', null, children),
    CardTitle: ({ children }: { children?: ReactNode }) => createElement('h2', null, children),
    Collapsible: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    CollapsibleContent: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    CollapsibleTrigger: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    Label: ({ children }: { children?: ReactNode }) => createElement('label', null, children),
    Separator: () => createElement('hr'),
}));

vi.mock('lucide-react', async importOriginal => ({
    ...await importOriginal<typeof import('lucide-react')>(),
    ChevronDown: () => createElement('span'),
    Trash2: () => createElement('span'),
}));

vi.mock('../../../hooks', () => ({
    useAdapterCatalog: () => ({ adapters: [], isLoading: false, error: null }),
    useStepConfigs: () => ({
        getStepConfig: (type: string) => ({ label: type, description: '', color: '#000' }),
    }),
}));

vi.mock('../../../utils', () => ({
    normalizeStepType: (type: string) => type,
    getAdapterTypeForStep: (type: string) => type === 'TRANSFORM' ? 'OPERATOR' : 'EXTRACTOR',
    getAdapterTypeLabel: (type: string) => type === 'OPERATOR' ? 'Operator' : 'Extractor',
}));

vi.mock('../schema-form', () => ({ SchemaFormRenderer: () => createElement('div') }));
vi.mock('../SchemaReferenceSelector', () => ({ SchemaReferenceSelector: () => createElement('div') }));
vi.mock('./AdapterSelector', () => ({ AdapterSelector: () => createElement('div', null, 'Adapter selector') }));
vi.mock('./AdapterRequiredWarning', () => ({ AdapterRequiredWarning: () => createElement('div') }));
vi.mock('./ValidateConfigComponent', () => ({ ValidateConfigComponent: () => createElement('div') }));
vi.mock('./RouteConfigComponent', () => ({ RouteConfigComponent: () => createElement('div') }));
vi.mock('./EnrichConfigComponent', () => ({ EnrichConfigComponent: () => createElement('div') }));
vi.mock('./GateConfigComponent', () => ({ GateConfigComponent: () => createElement('div') }));
vi.mock('../trigger-config', () => ({ TriggerForm: () => createElement('div') }));
vi.mock('./OperatorCheatSheetButton', () => ({ OperatorCheatSheetButton: () => createElement('div') }));
vi.mock('./AdvancedEditors', () => ({
    AdvancedMapEditor: () => createElement('div'),
    AdvancedTemplateEditor: () => createElement('div'),
    AdvancedWhenEditor: () => createElement('div'),
    MultiOperatorEditor: () => createElement('button', null, '+ Add Operator'),
}));
vi.mock('./StepTester', () => ({ StepTester: () => createElement('div') }));
vi.mock('./RetrySettingsComponent', () => ({ RetrySettingsComponent: () => createElement('div') }));
vi.mock('../ExecutionContextFields', () => ({
    ExecutionContextFields: ({ errors }: {
        errors?: Readonly<Record<string, string>>;
    }) => createElement('div', null, Object.values(errors ?? {}).join('|')),
}));

const transformData = {
    key: 'transform',
    type: 'TRANSFORM',
    config: { operators: [] },
};

function renderTransform(
    props: Partial<React.ComponentProps<typeof StepConfigPanel>> = {},
): string {
    return renderToStaticMarkup(
        <StepConfigPanel
            data={transformData}
            onChange={vi.fn()}
            catalog={[]}
            showHeader={false}
            showKeyInput={false}
            showStepTester={false}
            {...props}
        />,
    );
}

describe('StepConfigPanel catalog states', () => {
    it('does not render operator controls while the catalog is loading', () => {
        const markup = renderTransform({ catalogLoading: true });

        expect(markup).toContain('Loading operators...');
        expect(markup).not.toContain('+ Add Operator');
    });

    it('does not render operator controls when the catalog request fails', () => {
        const markup = renderTransform({ catalogError: new Error('Forbidden') });

        expect(markup).toContain('The adapter catalog could not be loaded. Reload the page to try again.');
        expect(markup).not.toContain('+ Add Operator');
    });

    it('shows an explicit empty state when no operators are registered', () => {
        const markup = renderTransform();

        expect(markup).toContain('No transform operators are registered.');
        expect(markup).not.toContain('+ Add Operator');
    });

    it('renders operator controls only when the catalog is ready', () => {
        const markup = renderTransform({ catalog: [trimOperator] as never });

        expect(markup).toContain('+ Add Operator');
    });

    it.each([
        { catalogLoading: true, text: 'Loading operators...' },
        { catalogError: new Error('refresh failed'), text: 'The adapter catalog could not be loaded. Reload the page to try again.' },
    ])('disables stale operator controls when catalog state is not ready', state => {
        const markup = renderTransform({
            catalog: [trimOperator] as never,
            ...state,
        });

        expect(markup).toContain(state.text);
        expect(markup).not.toContain('+ Add Operator');
    });

    it('preserves the generic adapter catalog error state', () => {
        const markup = renderToStaticMarkup(
            <StepConfigPanel
                data={{ key: 'extract', type: 'EXTRACT', config: {} }}
                onChange={vi.fn()}
                catalog={[]}
                catalogError={new Error('Forbidden')}
                showHeader={false}
                showKeyInput={false}
                showStepTester={false}
            />,
        );

        expect(markup).toContain('The adapter catalog could not be loaded. Reload the page to try again.');
    });

    it('passes exact validation messages to execution context controls', () => {
        const markup = renderTransform({
            errors: {
                'steps.transform.context.validationMode': 'Select a supported strictness.',
            },
        });

        expect(markup).toContain('Select a supported strictness.');
    });
});

const trimOperator = {
    code: 'trim',
    name: 'Trim',
    description: 'Trim strings',
    type: 'OPERATOR',
    color: '#000',
    icon: () => createElement('span'),
    schema: { fields: [] },
};
