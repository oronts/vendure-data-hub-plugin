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
    CardDescription,
    CardHeader,
    CardTitle,
    Badge,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@vendure/dashboard';
import { DATAHUB_NAV_SECTION, ROUTES, BUILT_IN_ADAPTER_PREFIXES, DATAHUB_PERMISSIONS, ADAPTER_TYPES } from '../../constants';
import { StatCard } from '../../components/shared';
import { DashboardRouteDefinition } from '@vendure/dashboard';
import {
    Database,
    Cog,
    Upload,
    RefreshCw,
    Puzzle,
    Settings2,
} from 'lucide-react';
import { ErrorState, LoadingState } from '../../components/shared';
import { useAdapters } from '../../hooks';
import { ADAPTER_TYPE_INFO } from './constants';
import { AdapterTypeSection } from './AdapterTypeSection';
import { AdaptersTable } from './AdaptersTable';
import { AdapterDetail } from './AdapterDetail';
import type { DataHubAdapter } from '../../types';

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
    const [selected, setSelected] = React.useState<DataHubAdapter | null>(null);

    const handleCloseDrawer = React.useCallback((open: boolean) => {
        if (!open) setSelected(null);
    }, []);

    const extractors = rows.filter(r => r.type === ADAPTER_TYPES.EXTRACTOR);
    const operators = rows.filter(r => r.type === ADAPTER_TYPES.OPERATOR);
    const loaders = rows.filter(r => r.type === ADAPTER_TYPES.LOADER);

    const isBuiltIn = React.useCallback((code: string) => {
        return BUILT_IN_ADAPTER_PREFIXES.some(p => code.startsWith(p));
    }, []);

    if (isError) {
        return (
            <Page pageId="data-hub-adapters">
                <PageBlock column="main" blockId="error">
                    <ErrorState
                        title="Failed to load adapters"
                        message={error instanceof Error ? error.message : 'An unknown error occurred'}
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

    return (
        <Page pageId="data-hub-adapters">
            <PageActionBar>
                <PageActionBarRight>
                    <Button variant="ghost" onClick={() => refetch()} disabled={isLoading} data-testid="datahub-adapters-refresh-button">
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </PageActionBarRight>
            </PageActionBar>

            <PageBlock column="main" blockId="intro">
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Puzzle className="w-5 h-5 text-primary" />
                            <CardTitle>Pipeline Adapters</CardTitle>
                        </div>
                        <CardDescription>
                            Adapters are the building blocks of your data pipelines. They handle extracting
                            data from sources, transforming it, and loading it into destinations.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                            <StatCard
                                icon={ADAPTER_TYPE_INFO.EXTRACTOR.icon}
                                title="Extractors"
                                value={extractors.length}
                                variant="info"
                            />
                            <StatCard
                                icon={ADAPTER_TYPE_INFO.OPERATOR.icon}
                                title="Operators"
                                value={operators.length}
                            />
                            <StatCard
                                icon={ADAPTER_TYPE_INFO.LOADER.icon}
                                title="Loaders"
                                value={loaders.length}
                                variant="success"
                            />
                        </div>
                    </CardContent>
                </Card>
            </PageBlock>

            <PageBlock column="main" blockId="adapters">
                <Tabs defaultValue="extractors" className="w-full">
                    <TabsList className="mb-4" data-testid="datahub-adapters-tabs">
                        <TabsTrigger value="extractors" className="gap-2" data-testid="datahub-adapters-tab-extractors">
                            <Database className="w-4 h-4" />
                            Extractors ({extractors.length})
                        </TabsTrigger>
                        <TabsTrigger value="operators" className="gap-2" data-testid="datahub-adapters-tab-operators">
                            <Cog className="w-4 h-4" />
                            Operators ({operators.length})
                        </TabsTrigger>
                        <TabsTrigger value="loaders" className="gap-2" data-testid="datahub-adapters-tab-loaders">
                            <Upload className="w-4 h-4" />
                            Loaders ({loaders.length})
                        </TabsTrigger>
                        <TabsTrigger value="all" className="gap-2" data-testid="datahub-adapters-tab-all">
                            <Settings2 className="w-4 h-4" />
                            All ({rows.length})
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="extractors">
                        <AdapterTypeSection
                            type="EXTRACTOR"
                            adapters={extractors}
                            onSelect={setSelected}
                            isBuiltIn={isBuiltIn}
                        />
                    </TabsContent>

                    <TabsContent value="operators">
                        <AdapterTypeSection
                            type="OPERATOR"
                            adapters={operators}
                            onSelect={setSelected}
                            isBuiltIn={isBuiltIn}
                        />
                    </TabsContent>

                    <TabsContent value="loaders">
                        <AdapterTypeSection
                            type="LOADER"
                            adapters={loaders}
                            onSelect={setSelected}
                            isBuiltIn={isBuiltIn}
                        />
                    </TabsContent>

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
                            <Badge className={ADAPTER_TYPE_INFO[selected?.type || 'EXTRACTOR']?.color ?? ''}>
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
