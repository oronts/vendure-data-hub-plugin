import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TemplateGallery } from './TemplateGallery';

vi.mock('@lingui/react/macro', () => ({
    Trans: ({ children }: { children?: ReactNode }) => {
        const source = String(children ?? '');
        const translations: Record<string, string> = {
            'All templates': 'Alle Vorlagen',
        };
        return createElement('span', null, translations[source] ?? children);
    },
    useLingui: () => ({
        t: (strings: TemplateStringsArray, ...values: unknown[]) => {
            const source = strings.reduce(
                (result, part, index) => result + part + String(values[index] ?? ''),
                '',
            );
            const translations: Record<string, string> = {
                'Search templates...': 'Vorlagen suchen...',
                'Search templates': 'Vorlagen suchen',
                'Selected template Produktimport': 'Ausgewählte Vorlage Produktimport',
            };
            return translations[source] ?? source;
        },
    }),
}));

vi.mock('@vendure/dashboard', () => ({
    Badge: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
    Input: (props: Record<string, unknown>) => createElement('input', props),
}));

vi.mock('lucide-react', async importOriginal => ({
    ...await importOriginal<typeof import('lucide-react')>(),
    CheckCircle: () => createElement('span'),
    Package: () => createElement('span'),
    Search: () => createElement('span'),
}));

vi.mock('../../utils', () => ({
    resolveIconName: () => undefined,
}));

describe('TemplateGallery localization', () => {
    it('localizes search controls and exposes selection state to assistive technology', () => {
        const template = {
            id: 'products',
            name: 'Produktimport',
            description: 'Produktdaten',
            category: 'products' as const,
            requiredFields: [],
            optionalFields: [],
        };
        const markup = renderToStaticMarkup(
            <TemplateGallery
                templates={[template]}
                categories={[{
                    category: 'products',
                    label: 'Produkte',
                    description: 'Produktvorlagen',
                    icon: 'package',
                    count: 1,
                }]}
                selectedTemplate={template}
                onSelectTemplate={vi.fn()}
            />,
        );

        expect(markup).toContain('placeholder="Vorlagen suchen..."');
        expect(markup).toContain('aria-label="Vorlagen suchen"');
        expect(markup).toContain('aria-label="Ausgewählte Vorlage Produktimport"');
        expect(markup).toContain('aria-pressed="true"');
        expect(markup).toContain('Alle Vorlagen');
    });
});
