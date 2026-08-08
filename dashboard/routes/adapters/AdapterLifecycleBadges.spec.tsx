import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AdapterLifecycleBadges } from './AdapterLifecycleBadges';

vi.mock('@vendure/dashboard', () => ({
    Badge: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));

vi.mock('lucide-react', async importOriginal => ({
    ...await importOriginal<typeof import('lucide-react')>(),
    AlertTriangle: () => createElement('span'),
}));

vi.mock('@lingui/react/macro', () => ({
    useLingui: () => ({
        t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce(
            (result, part, index) => result + part + String(values[index] ?? ''),
            '',
        ),
    }),
}));

describe('AdapterLifecycleBadges', () => {
    it.each(['v2', '2026.07'])(
        'renders opaque version metadata without rewriting %s',
        version => {
            const markup = renderToStaticMarkup(
                <AdapterLifecycleBadges version={version} />,
            );

            expect(markup).toContain(`>${version}<`);
            expect(markup).not.toContain(`>v${version}<`);
        },
    );

    it('localizes the deprecated lifecycle label while preserving version metadata', () => {
        const markup = renderToStaticMarkup(
            <AdapterLifecycleBadges version="v2" deprecated />,
        );

        expect(markup).toContain('Deprecated');
        expect(markup).toContain('>v2<');
    });
});
