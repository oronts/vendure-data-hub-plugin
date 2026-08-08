import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SelectableCard } from './SelectableCard';

vi.mock('@vendure/dashboard', () => ({
    Badge: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));

describe('SelectableCard', () => {
    it('forwards its test identifier to the button', () => {
        const markup = renderToStaticMarkup(
            <SelectableCard
                title="Google Merchant Center"
                selected={false}
                onClick={vi.fn()}
                data-testid="datahub-export-template-google-shopping-btn"
            />,
        );

        expect(markup).toContain(
            'data-testid="datahub-export-template-google-shopping-btn"',
        );
    });
});
