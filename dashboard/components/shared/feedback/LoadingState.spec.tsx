import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LOADING_STATE_TYPE } from '../../../constants';
import { LoadingState } from './LoadingState';

vi.mock('@vendure/dashboard', () => ({
    Card: ({ children, ...props }: { children?: ReactNode; 'aria-hidden'?: boolean }) =>
        createElement('section', props, children),
    CardContent: ({ children }: { children?: ReactNode }) =>
        createElement('div', null, children),
}));

vi.mock('@lingui/react/macro', () => ({
    useLingui: () => ({
        t: () => 'Wird geladen…',
    }),
}));

const SKELETON_TYPES = [
    LOADING_STATE_TYPE.TABLE,
    LOADING_STATE_TYPE.FORM,
    LOADING_STATE_TYPE.CARD,
    LOADING_STATE_TYPE.LIST,
] as const;

describe('LoadingState accessibility', () => {
    it('announces spinner loading state and hides its decorative icon', () => {
        const markup = renderToStaticMarkup(
            <LoadingState message="Loading catalog" />,
        );

        expect(markup).toContain('role="status"');
        expect(markup).toContain('aria-live="polite"');
        expect(markup).toContain('aria-busy="true"');
        expect(markup).toContain('aria-hidden="true"');
        expect(markup).toContain('Loading catalog');
    });

    it.each(SKELETON_TYPES)('announces %s skeletons with localized fallback text', type => {
        const markup = renderToStaticMarkup(
            <LoadingState type={type} rows={1} />,
        );

        expect(markup).toContain('role="status"');
        expect(markup).toContain('aria-live="polite"');
        expect(markup).toContain('aria-busy="true"');
        expect(markup).toContain('class="sr-only"');
        expect(markup).toContain('Wird geladen…');
        expect(markup).toContain('aria-hidden="true"');
    });
});
