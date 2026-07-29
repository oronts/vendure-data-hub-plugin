import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Consumer } from './types';
import { ConsumersTable } from './ConsumersTable';

vi.mock('@lingui/react/macro', () => ({
    Trans: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
    useLingui: () => ({
        i18n: { locale: 'en' },
        t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce(
            (message, part, index) => `${message}${part}${String(values[index] ?? '')}`,
            '',
        ),
    }),
}));

vi.mock('@vendure/dashboard', () => ({
    Badge: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
    Button: ({
        children,
        ...props
    }: {
        children?: ReactNode;
        [key: string]: unknown;
    }) => createElement('button', props, children),
    PermissionGuard: ({
        children,
        requires,
    }: {
        children?: ReactNode;
        requires: string[];
    }) => createElement('section', {
        'data-requires': requires.join(','),
    }, children),
}));

vi.mock('lucide-react', async importOriginal => ({
    ...await importOriginal<typeof import('lucide-react')>(),
    Play: () => createElement('span'),
    Radio: () => createElement('span'),
    Square: () => createElement('span'),
}));

vi.mock('../../hooks', () => ({
    useLoadMore: (items: Consumer[]) => ({
        displayed: items,
        hasMore: false,
        remaining: 0,
        loadMore: vi.fn(),
    }),
}));

vi.mock('../../components/shared', () => ({
    LoadMoreButton: () => createElement('button'),
}));

vi.mock('../../utils', () => ({
    formatDateTime: () => 'formatted date',
}));

const consumers: Consumer[] = [
    { pipelineCode: 'orders', triggerKey: 'events', queueName: 'orders-queue', isActive: true, messagesProcessed: 1, messagesFailed: 0, lastMessageAt: null },
    { pipelineCode: 'inventory', triggerKey: 'events', queueName: 'inventory-queue', isActive: true, messagesProcessed: 2, messagesFailed: 0, lastMessageAt: null },
    { pipelineCode: 'exports', triggerKey: 'timer', queueName: 'exports-queue', isActive: false, messagesProcessed: 3, messagesFailed: 0, lastMessageAt: null },
];

function render(): string {
    return renderToStaticMarkup(
        <ConsumersTable
            consumers={consumers}
            onStop={vi.fn()}
            onStart={vi.fn()}
            pendingStop={{ pipelineCode: 'orders', triggerKey: 'events' }}
            pendingStart={{ pipelineCode: 'exports', triggerKey: 'timer' }}
        />,
    );
}

function buttonTag(markup: string, label: string): string {
    return markup.match(new RegExp(`<button(?=[^>]*aria-label="${label}")[^>]*>`))?.[0] ?? '';
}

describe('ConsumersTable lifecycle controls', () => {
    it('requires run permission and keeps the dense table mobile-scrollable', () => {
        const markup = render();

        expect(markup.match(/data-requires="RunDataHubPipeline"/g)).toHaveLength(3);
        expect(markup).not.toContain('UpdateDataHubPipeline');
        expect(markup).toContain('class="overflow-x-auto"');
        expect(markup).toContain('<caption');
    });

    it('disables only the consumer rows owned by pending mutations', () => {
        const markup = render();
        const orders = buttonTag(markup, 'Stop consumer for queue orders-queue');
        const inventory = buttonTag(markup, 'Stop consumer for queue inventory-queue');
        const exports = buttonTag(markup, 'Start consumer for queue exports-queue');

        expect(orders).toContain('disabled');
        expect(inventory).not.toContain('disabled');
        expect(exports).toContain('disabled');
    });
});
