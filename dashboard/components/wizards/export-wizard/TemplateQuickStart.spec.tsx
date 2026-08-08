import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ExportTemplate } from '../../../hooks/use-export-templates';
import { TemplateQuickStart } from './TemplateQuickStart';

const interactions = vi.hoisted(() => ({
    retry: undefined as (() => void) | undefined,
    templates: [] as Array<() => void>,
}));

vi.mock('@lingui/react/macro', () => ({
    Trans: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
    useLingui: () => ({
        t: (parts: TemplateStringsArray, ...values: unknown[]) =>
            parts.reduce((message, part, index) => message + part + String(values[index] ?? ''), ''),
    }),
}));

vi.mock('@vendure/dashboard', () => ({
    Card: ({ children }: { children?: ReactNode }) => createElement('section', null, children),
    CardContent: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    CardHeader: ({ children }: { children?: ReactNode }) => createElement('header', null, children),
    CardTitle: ({ children }: { children?: ReactNode }) => createElement('h2', null, children),
}));

vi.mock('../../shared', () => ({
    LoadingState: ({ message }: { message: string }) =>
        createElement('div', { 'data-testid': 'quick-start-loading' }, message),
    ErrorState: ({
        message,
        onRetry,
    }: {
        message: string;
        onRetry: () => void;
    }) => {
        interactions.retry = onRetry;
        return createElement('div', { 'data-testid': 'quick-start-error' }, message);
    },
    SelectableCardGrid: ({ children }: { children?: ReactNode }) =>
        createElement('div', null, children),
    SelectableCard: ({
        title,
        onClick,
    }: {
        title: string;
        onClick: () => void;
    }) => {
        interactions.templates.push(onClick);
        return createElement('article', null, title);
    },
}));

function template(id: string): ExportTemplate {
    return {
        id,
        name: `Template ${id}`,
        description: `Description ${id}`,
        format: 'CSV',
        requiredFields: [],
    };
}

const baseProps = {
    templates: [] as ExportTemplate[],
    isLoading: false,
    isError: false,
    error: null,
    onRetry: vi.fn(),
    onUseTemplate: vi.fn(),
};

describe('TemplateQuickStart', () => {
    it('shows loading and errors with retry feedback', () => {
        const loadingMarkup = renderToStaticMarkup(
            <TemplateQuickStart {...baseProps} isLoading />,
        );
        expect(loadingMarkup).toContain('data-testid="quick-start-loading"');

        const onRetry = vi.fn();
        const errorMarkup = renderToStaticMarkup(
            <TemplateQuickStart
                {...baseProps}
                isError
                error={new Error('quick-start unavailable')}
                onRetry={onRetry}
            />,
        );
        expect(errorMarkup).toContain('quick-start unavailable');
        interactions.retry?.();
        expect(onRetry).toHaveBeenCalledOnce();
    });

    it('renders nothing for a legitimate empty catalog', () => {
        expect(renderToStaticMarkup(<TemplateQuickStart {...baseProps} />)).toBe('');
    });

    it('shows at most four server templates and forwards selection', () => {
        interactions.templates = [];
        const onUseTemplate = vi.fn();
        const templates = ['1', '2', '3', '4', '5'].map(template);
        const markup = renderToStaticMarkup(
            <TemplateQuickStart
                {...baseProps}
                templates={templates}
                onUseTemplate={onUseTemplate}
            />,
        );

        expect(markup).toContain('Template 1');
        expect(markup).toContain('Template 4');
        expect(markup).not.toContain('Template 5');
        interactions.templates[0]?.();
        expect(onUseTemplate).toHaveBeenCalledWith(templates[0]);
    });
});
