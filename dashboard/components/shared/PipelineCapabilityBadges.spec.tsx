import { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PipelineCapabilityBadges } from './PipelineCapabilityBadges';

vi.mock('@vendure/dashboard', () => ({
    Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

describe('PipelineCapabilityBadges', () => {
    it('renders required permissions and write domains without rewriting codes', () => {
        const markup = renderToStaticMarkup(
            <PipelineCapabilityBadges
                requiredCapabilities={['UpdateCatalog', 'UseDataHubSecret']}
                writeCapabilities={['CATALOG']}
            />,
        );

        expect(markup).toContain('UpdateCatalog');
        expect(markup).toContain('UseDataHubSecret');
        expect(markup).toContain('CATALOG');
    });

    it('renders a neutral empty value', () => {
        expect(renderToStaticMarkup(
            <PipelineCapabilityBadges
                requiredCapabilities={[]}
                writeCapabilities={[]}
            />,
        )).toContain('—');
    });
});
