import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TemplateStep } from './TemplateStep';

const feedback = vi.hoisted(() => ({ retry: undefined as (() => void) | undefined }));

vi.mock('@lingui/react/macro', () => ({
    Trans: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
    useLingui: () => ({
        t: (parts: TemplateStringsArray, ...values: unknown[]) =>
            parts.reduce((message, part, index) => message + part + String(values[index] ?? ''), ''),
    }),
}));

vi.mock('@vendure/dashboard', () => ({
    Button: ({ children }: { children?: ReactNode }) => createElement('button', null, children),
}));

vi.mock('lucide-react', async importOriginal => ({
    ...await importOriginal<typeof import('lucide-react')>(),
    Check: () => createElement('span'),
    Clock: () => createElement('span'),
    Columns: () => createElement('span'),
    Database: () => createElement('span'),
    Eye: () => createElement('span'),
    FileCode: () => createElement('span'),
    LayoutTemplate: () => createElement('span'),
    Settings: () => createElement('span'),
    Sparkles: () => createElement('span'),
    Table: () => createElement('span'),
    Zap: () => createElement('span'),
}));

vi.mock('../../templates', () => ({
    TemplateGallery: () => createElement('div', { 'data-testid': 'template-gallery' }),
    TemplatePreview: () => createElement('div', { 'data-testid': 'template-preview' }),
}));

vi.mock('../../shared', () => ({
    LoadingState: ({ message }: { message: string }) =>
        createElement('div', { 'data-testid': 'template-loading' }, message),
    ErrorState: ({
        title,
        message,
        onRetry,
    }: {
        title: string;
        message: string;
        onRetry: () => void;
    }) => {
        feedback.retry = onRetry;
        return createElement('div', { 'data-testid': 'template-error' }, title, message);
    },
}));

const baseProps = {
    templates: [],
    categories: [],
    selectedTemplate: null,
    onSelectTemplate: vi.fn(),
    onUseTemplate: vi.fn(),
    onStartFromScratch: vi.fn(),
    onRetry: vi.fn(),
    error: null,
};

describe('TemplateStep template query states', () => {
    it('keeps the manual path available while templates load', () => {
        const markup = renderToStaticMarkup(
            <TemplateStep {...baseProps} isLoading isError={false} />,
        );

        expect(markup).toContain('Start from scratch');
        expect(markup).toContain('data-testid="template-loading"');
        expect(markup).not.toContain('data-testid="template-gallery"');
    });

    it('shows the template error with a working retry while preserving manual setup', () => {
        const onRetry = vi.fn();
        const markup = renderToStaticMarkup(
            <TemplateStep
                {...baseProps}
                isLoading={false}
                isError
                error={new Error('template service unavailable')}
                onRetry={onRetry}
            />,
        );

        expect(markup).toContain('Start from scratch');
        expect(markup).toContain('template service unavailable');
        expect(markup).not.toContain('data-testid="template-gallery"');
        feedback.retry?.();
        expect(onRetry).toHaveBeenCalledOnce();
    });

    it('renders the gallery only when template metadata is ready', () => {
        const markup = renderToStaticMarkup(
            <TemplateStep {...baseProps} isLoading={false} isError={false} />,
        );

        expect(markup).toContain('data-testid="template-gallery"');
    });
});
