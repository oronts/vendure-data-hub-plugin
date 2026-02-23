import * as React from 'react';
import {
    DashboardRouteDefinition,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    PermissionGuard,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@vendure/dashboard';
import {
    BarChart3,
    FileText,
    Zap,
} from 'lucide-react';
import { DATAHUB_NAV_SECTION, ROUTES, DATAHUB_PERMISSIONS } from '../../constants';
import { LogsOverviewTab } from './components/LogsOverviewTab';
import { LogExplorerTab } from './components/LogExplorerTab';
import { RealtimeLogTab } from './components/RealtimeLogTab';

/**
 * Route definition for the Logs & Analytics page.
 * Navigation and permission guarding.
 */
export const logsPage: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-logs',
        url: ROUTES.LOGS,
        title: 'Logs & Analytics',
    },
    path: ROUTES.LOGS,
    loader: () => ({ breadcrumb: 'Logs & Analytics' }),
    component: () => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.VIEW_RUNS]}>
            <LogsPage />
        </PermissionGuard>
    ),
};

/**
 * Logs page with tabbed layout: Overview, Log Explorer, Real-time Feed.
 */
function LogsPage() {
    const initialRunId = React.useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('runId') ?? undefined;
    }, []);

    const [activeTab, setActiveTab] = React.useState(initialRunId ? 'logs' : 'overview');

    return (
        <Page pageId="data-hub-logs">
            <PageActionBar>
                <PageActionBarRight />
            </PageActionBar>

            <PageBlock column="main" blockId="tabs">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="mb-4" data-testid="datahub-logs-tabs">
                        <TabsTrigger value="overview" className="gap-2" data-testid="datahub-logs-tab-overview">
                            <BarChart3 className="w-4 h-4" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger value="logs" className="gap-2" data-testid="datahub-logs-tab-explorer">
                            <FileText className="w-4 h-4" />
                            Log Explorer
                        </TabsTrigger>
                        <TabsTrigger value="realtime" className="gap-2" data-testid="datahub-logs-tab-realtime">
                            <Zap className="w-4 h-4" />
                            Real-time Feed
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview">
                        <LogsOverviewTab />
                    </TabsContent>

                    <TabsContent value="logs">
                        <LogExplorerTab initialRunId={initialRunId} />
                    </TabsContent>

                    <TabsContent value="realtime">
                        {activeTab === 'realtime' && <RealtimeLogTab />}
                    </TabsContent>
                </Tabs>
            </PageBlock>
        </Page>
    );
}
