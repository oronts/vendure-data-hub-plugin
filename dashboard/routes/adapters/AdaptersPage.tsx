import * as React from 'react';
import {
    Button,
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
    PageBlock,
    PermissionGuard,
    Page,
    PageActionBar,
    PageActionBarRight,
    Card,
    CardContent,
    Badge,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@vendure/dashboard';
import { DATAHUB_NAV_SECTION, ROUTES, DATAHUB_PERMISSIONS, FALLBACK_ADAPTER_TYPE_TABS } from '../../constants';
import { DashboardRouteDefinition } from '@vendure/dashboard';
import {
    RefreshCw,
    Puzzle,
    Settings2,
    Layers,
} from 'lucide-react';
import { ErrorState, LoadingState } from '../../components/shared';
import { cn } from '../../utils';
import { useAdapters } from '../../hooks';
import { useOptionValues } from '../../hooks/api/use-config-options';
import { resolveIconName } from '../../utils/icon-resolver';
import { AdapterTypeSection } from './AdapterTypeSection';
import { AdaptersTable } from './AdaptersTable';
import { AdapterDetail } from './AdapterDetail';
import { getErrorMessage } from '../../../shared';
import type { DataHubAdapter } from '../../types';

/** Accent colors per stat position for visual variety */
const STAT_ACCENTS = [
    { bg: 'bg-blue-500/15 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-500/20' },
    { bg: 'bg-violet-500/15 dark:bg-violet-500/20', text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-500/20' },
    { bg: 'bg-emerald-500/15 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500/20' },
    { bg: 'bg-amber-500/15 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500/20' },
    { bg: 'bg-rose-500/15 dark:bg-rose-500/20', text: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-500/20' },
    { bg: 'bg-cyan-500/15 dark:bg-cyan-500/20', text: 'text-cyan-600 dark:text-cyan-400', ring: 'ring-cyan-500/20' },
    { bg: 'bg-orange-500/15 dark:bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400', ring: 'ring-orange-500/20' },
] as const;

export const adaptersList: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-adapters',
        url: ROUTES.ADAPTERS,
        title: 'Adapters',
    },
    path: ROUTES.ADAPTERS,
    loader: () => ({ breadcrumb: 'Adapters' }),
    component: () => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.MANAGE_ADAPTERS]}>
            <AdaptersPage />
        </PermissionGuard>
    ),
};

function AdaptersPage() {
    const { data: rows = [], isLoading, isError, error, refetch } = useAdapters();
    const { options: adapterTypes } = useOptionValues('adapterTypes');
    const [selected, setSelected] = React.useState<DataHubAdapter | null>(null);

    const handleCloseDrawer = React.useCallback((open: boolean) => {
        if (!open) setSelected(null);
    }, []);

    const tabs = adapterTypes.length > 0 ? adapterTypes : FALLBACK_ADAPTER_TYPE_TABS;

    /** Group adapters by type, keyed by adapter type value */
    const adaptersByType = React.useMemo(() => {
        const map: Record<string, DataHubAdapter[]> = {};
        for (const tab of tabs) {
            map[tab.value] = rows.filter(r => r.type === tab.value);
        }
        return map;
    }, [rows, tabs]);

    /** Only show tabs that have at least one adapter registered */
    const activeTabs = React.useMemo(
        () => tabs.filter(tab => (adaptersByType[tab.value]?.length ?? 0) > 0),
        [tabs, adaptersByType],
    );

    const builtInSet = React.useMemo(() => {
        const set = new Set<string>();
        for (const adapter of rows) {
            if (adapter.builtIn !== false) {
                set.add(adapter.code);
            }
        }
        return set;
    }, [rows]);

    const isBuiltIn = React.useCallback((code: string) => {
        return builtInSet.has(code);
    }, [builtInSet]);

    const customCount = React.useMemo(
        () => rows.filter(r => !builtInSet.has(r.code)).length,
        [rows, builtInSet],
    );

    if (isError) {
        return (
            <Page pageId="data-hub-adapters">
                <PageBlock column="main" blockId="error">
                    <ErrorState
                        title="Failed to load adapters"
                        message={getErrorMessage(error)}
                        onRetry={() => refetch()}
                    />
                </PageBlock>
            </Page>
        );
    }

    if (isLoading && rows.length === 0) {
        return (
            <Page pageId="data-hub-adapters">
                <PageBlock column="main" blockId="loading">
                    <LoadingState type="card" rows={3} message="Loading adapters..." />
                </PageBlock>
            </Page>
        );
    }

    const defaultTab = activeTabs.length > 0 ? activeTabs[0].value.toLowerCase() : 'all';

    return (
        <Page pageId="data-hub-adapters">
            <PageActionBar>
                <PageActionBarRight>
                    <Button variant="ghost" onClick={() => refetch()} disabled={isLoading} data-testid="datahub-adapters-refresh-button">
                        <RefreshCw className={cn('w-4 h-4 mr-2', isLoading && 'animate-spin')} />
                        Refresh
                    </Button>
                </PageActionBarRight>
            </PageActionBar>

            <PageBlock column="main" blockId="intro">
                <Card className="overflow-hidden">
                    <CardContent className="p-0">
                        {/* Hero header row */}
                        <div className="flex items-center justify-between px-6 py-5 border-b bg-muted/20">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                                    <Layers className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold tracking-tight">Pipeline Adapters</h2>
                                    <p className="text-sm text-muted-foreground">
                                        {rows.length} registered &middot; {rows.length - customCount} built-in &middot; {customCount} custom
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Stat chips grid - responsive, uses static grid classes */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 p-5">
                            {activeTabs.map((tab, idx) => {
                                const Icon = resolveIconName(tab.icon);
                                const accent = STAT_ACCENTS[idx % STAT_ACCENTS.length];
                                const count = adaptersByType[tab.value]?.length ?? 0;
                                return (
                                    <div
                                        key={tab.value}
                                        className="group relative flex items-center gap-3 rounded-xl border bg-card p-3.5 transition-all hover:shadow-md hover:border-primary/30"
                                    >
                                        <div className={cn('flex-shrink-0 p-2 rounded-lg ring-1', accent.bg, accent.ring)}>
                                            {Icon
                                                ? <Icon className={cn('w-4 h-4', accent.text)} />
                                                : <Puzzle className={cn('w-4 h-4', accent.text)} />
                                            }
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs text-muted-foreground truncate">{tab.label}</p>
                                            <p className={cn('text-xl font-bold tabular-nums leading-tight', accent.text)}>
                                                {count}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            </PageBlock>

            <PageBlock column="main" blockId="adapters">
                <Tabs defaultValue={defaultTab} className="w-full">
                    <TabsList className="mb-4" data-testid="datahub-adapters-tabs">
                        {activeTabs.map(tab => {
                            const Icon = resolveIconName(tab.icon);
                            const tabKey = tab.value.toLowerCase();
                            const count = adaptersByType[tab.value]?.length ?? 0;
                            return (
                                <TabsTrigger
                                    key={tab.value}
                                    value={tabKey}
                                    className="gap-2"
                                    data-testid={`datahub-adapters-tab-${tabKey}`}
                                >
                                    {Icon && <Icon className="w-4 h-4" />}
                                    {tab.label}
                                    <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs font-medium">
                                        {count}
                                    </Badge>
                                </TabsTrigger>
                            );
                        })}
                        <TabsTrigger value="all" className="gap-2" data-testid="datahub-adapters-tab-all">
                            <Settings2 className="w-4 h-4" />
                            All
                            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs font-medium">
                                {rows.length}
                            </Badge>
                        </TabsTrigger>
                    </TabsList>

                    {activeTabs.map(tab => {
                        const tabKey = tab.value.toLowerCase();
                        return (
                            <TabsContent key={tab.value} value={tabKey}>
                                <AdapterTypeSection
                                    type={tab.value}
                                    label={tab.label}
                                    description={tab.description ?? undefined}
                                    icon={tab.icon ?? undefined}
                                    adapters={adaptersByType[tab.value] ?? []}
                                    onSelect={setSelected}
                                    isBuiltIn={isBuiltIn}
                                />
                            </TabsContent>
                        );
                    })}

                    <TabsContent value="all">
                        <AdaptersTable
                            adapters={rows}
                            onSelect={setSelected}
                            isBuiltIn={isBuiltIn}
                            isLoading={isLoading}
                        />
                    </TabsContent>
                </Tabs>
            </PageBlock>

            <Drawer open={!!selected} onOpenChange={handleCloseDrawer}>
                <DrawerContent data-testid="datahub-adapter-detail-drawer">
                    <DrawerHeader>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline">
                                {selected?.type}
                            </Badge>
                            <DrawerTitle>{selected?.code}</DrawerTitle>
                        </div>
                        <DrawerDescription>
                            {selected?.description || 'No description available'}
                        </DrawerDescription>
                    </DrawerHeader>
                    {selected && <AdapterDetail adapter={selected} />}
                </DrawerContent>
            </Drawer>
        </Page>
    );
}
