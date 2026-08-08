import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogsOverviewTab } from './LogsOverviewTab';

const hooks = vi.hoisted(() => ({
    buttonClicks: [] as Array<() => void>,
    refetchLogStats: vi.fn(),
    hasPermissions: vi.fn(),
    useAnalyticsOverview: vi.fn(),
    useLogStats: vi.fn(),
    usePipelineList: vi.fn(),
    useOptionValues: vi.fn(),
}));

vi.mock('@vendure/dashboard', () => ({
    Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => {
        if (onClick) hooks.buttonClicks.push(onClick);
        return createElement('button', null, children);
    },
    Card: ({ children }: { children?: ReactNode }) => createElement('section', null, children),
    CardContent: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    CardDescription: ({ children }: { children?: ReactNode }) => createElement('p', null, children),
    CardHeader: ({ children }: { children?: ReactNode }) => createElement('header', null, children),
    CardTitle: ({ children }: { children?: ReactNode }) => createElement('h2', null, children),
    useLocalFormat: () => ({
        formatNumber: (value: number) => new Intl.NumberFormat('en-US').format(value),
    }),
    usePermissions: () => ({ hasPermissions: hooks.hasPermissions }),
}));

vi.mock('@lingui/react/macro', () => ({
    Trans: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
    useLingui: () => ({
        t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce(
            (result, part, index) => result + part + String(values[index] ?? ''),
            '',
        ),
    }),
}));

vi.mock('@tanstack/react-query', () => ({
    useQuery: hooks.usePipelineList,
    useQueryClient: () => ({ refetchQueries: hooks.refetchLogStats }),
}));

vi.mock('lucide-react', async importOriginal => ({
    ...await importOriginal<typeof import('lucide-react')>(),
    Activity: () => createElement('span'),
    AlertCircle: () => createElement('span'),
    AlertTriangle: () => createElement('span'),
    Clock: () => createElement('span'),
    RefreshCw: () => createElement('span'),
    TrendingUp: () => createElement('span'),
}));

vi.mock('../../../hooks/api/use-analytics', () => ({
    analyticsKeys: {
        overview: () => ['analytics', 'overview'],
    },
    useAnalyticsOverview: hooks.useAnalyticsOverview,
}));

vi.mock('../../../hooks/api/use-logs', () => ({
    logKeys: {
        stats: () => ['logs', 'stats'],
    },
    useLogStats: hooks.useLogStats,
}));

vi.mock('../../../hooks/api/use-pipelines', () => ({
    pipelinesListDocument: {},
}));

vi.mock('../../../hooks/api/use-config-options', () => ({
    useOptionValues: hooks.useOptionValues,
}));

vi.mock('../../../components/shared', () => ({
    ErrorState: ({ message }: { message: string }) => createElement('div', null, `ErrorState: ${message}`),
    LoadingState: () => createElement('div', null, 'LoadingState'),
    StatCard: ({ title, value }: { title: string; value: ReactNode }) => createElement('div', null, `${title}: ${String(value)}`),
    LoadMoreButton: () => createElement('button', null, 'Load more'),
}));

vi.mock('./LogLevelBadge', () => ({
    LevelBadge: ({ level }: { level: string }) => createElement('span', null, level),
}));

vi.mock('../../../types', () => ({
    SortOrder: { ASC: 'ASC' },
}));

function statsQuery(overrides: Record<string, unknown> = {}) {
    return {
        data: {
            total: 25,
            errorsToday: 2,
            warningsToday: 3,
            avgDurationMs: 12,
            byLevel: {},
        },
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        ...overrides,
    };
}

function analyticsQuery(overrides: Record<string, unknown> = {}) {
    return {
        data: {
            totalPipelines: 50,
            enabledPipelines: 50,
            runsToday: 9,
            runsThisWeek: 36,
            successRateToday: 100,
            successRateWeek: 97.2,
            recordsProcessedToday: 2103,
            recordsFailedToday: 0,
            avgDurationMsToday: 912.4,
        },
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        ...overrides,
    };
}

function pipelinesQuery(overrides: Record<string, unknown> = {}) {
    return {
        data: { items: [], totalItems: 0 },
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
        ...overrides,
    };
}

describe('LogsOverviewTab permissions', () => {
    beforeEach(() => {
        hooks.buttonClicks.length = 0;
        hooks.refetchLogStats.mockReset();
        hooks.hasPermissions.mockReturnValue(true);
        hooks.useAnalyticsOverview.mockReturnValue(analyticsQuery());
        hooks.useLogStats.mockReturnValue(statsQuery());
        hooks.usePipelineList.mockReturnValue(pipelinesQuery());
        hooks.useOptionValues.mockReturnValue({ options: [] });
    });

    it('renders persisted run analytics separately from log diagnostics', () => {
        const markup = renderToStaticMarkup(<LogsOverviewTab />);

        expect(markup).toContain('Run analytics');
        expect(markup).toContain('Total pipelines: 50');
        expect(markup).toContain('Runs today: 9');
        expect(markup).toContain('Success today: 100%');
        expect(markup).toContain('Success this week: 97.2%');
        expect(markup).toContain('Records processed today: 2,103');
        expect(markup).toContain('Log diagnostics');
        expect(markup).toContain('Retained logs: 25');
    });

    it('keeps aggregate analytics available without pipeline metadata permission', () => {
        hooks.hasPermissions.mockImplementation(
            (permissions: string[]) => permissions.includes('ViewDataHubAnalytics'),
        );
        hooks.usePipelineList.mockReturnValue(pipelinesQuery({
            data: undefined,
            isError: true,
            error: new Error('Forbidden'),
        }));

        const markup = renderToStaticMarkup(<LogsOverviewTab />);

        expect(markup).toContain('Total pipelines: 50');
        expect(markup).toContain('Retained logs: 25');
        expect(markup).toContain('Errors Today: 2');
        expect(markup).toContain('You do not have permission to view pipeline details.');
        expect(markup).not.toContain('ErrorState');
        expect(hooks.usePipelineList).toHaveBeenCalledWith(
            expect.objectContaining({ enabled: false }),
        );
    });

    it('does not request persisted analytics without analytics permission', () => {
        hooks.hasPermissions.mockImplementation(
            (permissions: string[]) => !permissions.includes('ViewDataHubAnalytics'),
        );

        const markup = renderToStaticMarkup(<LogsOverviewTab />);

        expect(hooks.useAnalyticsOverview).toHaveBeenCalledWith(false);
        expect(markup).not.toContain('Run analytics');
        expect(markup).toContain('Retained logs: 25');
    });

    it('keeps log diagnostics visible when persisted analytics fails', () => {
        hooks.useAnalyticsOverview.mockReturnValue(analyticsQuery({
            data: undefined,
            isError: true,
            error: new Error('Analytics query failed'),
        }));

        const markup = renderToStaticMarkup(<LogsOverviewTab />);

        expect(markup).toContain('ErrorState: Analytics query failed');
        expect(markup).toContain('Retained logs: 25');
    });

    it('keeps log diagnostics visible while persisted analytics loads', () => {
        hooks.useAnalyticsOverview.mockReturnValue(analyticsQuery({
            data: undefined,
            isLoading: true,
        }));

        const markup = renderToStaticMarkup(<LogsOverviewTab />);

        expect(markup).toContain('LoadingState');
        expect(markup).toContain('Retained logs: 25');
    });

    it('retains pipeline metadata errors for permitted users', () => {
        hooks.usePipelineList.mockReturnValue(pipelinesQuery({
            data: undefined,
            isError: true,
            error: new Error('Pipeline query failed'),
        }));

        const markup = renderToStaticMarkup(<LogsOverviewTab />);

        expect(markup).toContain('ErrorState: Pipeline query failed');
        expect(hooks.usePipelineList).toHaveBeenCalledWith(
            expect.objectContaining({ enabled: true }),
        );
    });

    it('refreshes aggregate and visible per-pipeline statistics', () => {
        const refetchPipelines = vi.fn();
        hooks.usePipelineList.mockReturnValue(pipelinesQuery({
            data: {
                items: [{ id: '1', code: 'catalog', name: 'Catalog' }],
                totalItems: 1,
            },
            refetch: refetchPipelines,
        }));

        renderToStaticMarkup(<LogsOverviewTab />);
        hooks.buttonClicks[0]?.();

        expect(hooks.refetchLogStats).toHaveBeenCalledWith({
            queryKey: ['logs', 'stats'],
        });
        expect(hooks.refetchLogStats).toHaveBeenCalledWith({
            queryKey: ['analytics', 'overview'],
        });
        expect(refetchPipelines).toHaveBeenCalled();
    });
});
