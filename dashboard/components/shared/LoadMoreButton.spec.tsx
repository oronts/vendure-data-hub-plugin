import { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LoadMoreButton } from './LoadMoreButton';

vi.mock('@vendure/dashboard', () => ({
    Button: ({ children, disabled }: { children?: ReactNode; disabled?: boolean }) => (
        <button disabled={disabled}>{children}</button>
    ),
}));

vi.mock('@lingui/react/macro', () => ({
    useLingui: () => ({
        t: (strings: TemplateStringsArray, ...values: unknown[]) => {
            const message = strings.reduce(
                (result, part, index) => result + part + String(values[index] ?? ''),
                '',
            );
            if (message === 'Loading...') return 'Wird geladen…';
            return message.replace(/^Load more \((\d+) remaining\)$/, 'Mehr laden ($1 verbleibend)');
        },
    }),
}));

describe('LoadMoreButton', () => {
    it('uses localized fallback labels', () => {
        expect(renderToStaticMarkup(
            <LoadMoreButton remaining={7} onClick={vi.fn()} />,
        )).toContain('Mehr laden (7 verbleibend)');

        expect(renderToStaticMarkup(
            <LoadMoreButton remaining={7} onClick={vi.fn()} loading />,
        )).toContain('Wird geladen…');
    });

    it('preserves caller-provided labels', () => {
        const markup = renderToStaticMarkup(
            <LoadMoreButton
                remaining={2}
                onClick={vi.fn()}
                label="Fetch next page"
                loadingLabel="Fetching"
            />,
        );

        expect(markup).toContain('Fetch next page');
    });
});
