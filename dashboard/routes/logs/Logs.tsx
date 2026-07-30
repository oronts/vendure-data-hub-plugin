import * as React from 'react';
import { Trans } from '@lingui/react/macro';
import {
    DashboardRouteDefinition,
    Page,
    PageBlock,
    PageLayout,
    PageTitle,
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
import { DATAHUB_NAV_LABELS, DATAHUB_NAV_SECTION, ROUTES, DATAHUB_PERMISSIONS } from '../../constants';
import { LogsOverviewTab } from './components/LogsOverviewTab';
import { LogExplorerTab } from './components/LogExplorerTab';
import { RealtimeLogTab } from './components/RealtimeLogTab';
import { parseLogsRouteSearch, type LogsRouteSearch } from './log-search';

/**
 * Route definition for the Logs & Analytics page.
 * Navigation and permission guarding.
 */
export const logsPage: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-logs',
        url: ROUTES.LOGS,
        title: DATAHUB_NAV_LABELS.LOGS,
        requiresPermission: DATAHUB_PERMISSIONS.VIEW_RUNS,
    },
    path: ROUTES.LOGS,
    loader: () => ({ breadcrumb: DATAHUB_NAV_LABELS.LOGS }),
    validateSearch: parseLogsRouteSearch,
    component: route => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.VIEW_RUNS]}>
            <LogsPage route={route} />
        </PermissionGuard>
    ),
};

/**
 * Logs page with tabbed layout: Overview, Log Explorer, Real-time Feed.
 */
function LogsPage({
    route,
}: {
    route: Parameters<DashboardRouteDefinition['component']>[0];
}) {
    const { runId } = route.useSearch() as LogsRouteSearch;
    const [activeTab, setActiveTab] = React.useState(runId ? 'logs' : 'overview');

    React.useEffect(() => {
        if (runId) {
            setActiveTab('logs');
        }
    }, [runId]);

    return (
        <Page pageId="data-hub-logs">
            <PageTitle><Trans>Logs & Analytics</Trans></PageTitle>
            <PageLayout>
            <PageBlock column="main" blockId="tabs">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="mb-4" data-testid="datahub-logs-tabs">
                        <TabsTrigger value="overview" className="gap-2" data-testid="datahub-logs-tab-overview">
                            <BarChart3 className="w-4 h-4" />
                            <Trans>Overview</Trans>
                        </TabsTrigger>
                        <TabsTrigger value="logs" className="gap-2" data-testid="datahub-logs-tab-explorer">
                            <FileText className="w-4 h-4" />
                            <Trans>Log Explorer</Trans>
                        </TabsTrigger>
                        <TabsTrigger value="realtime" className="gap-2" data-testid="datahub-logs-tab-realtime">
                            <Zap className="w-4 h-4" />
                            <Trans>Real-time Feed</Trans>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview">
                        <LogsOverviewTab />
                    </TabsContent>

                    <TabsContent value="logs">
                        <LogExplorerTab initialRunId={runId} />
                    </TabsContent>

                    <TabsContent value="realtime">
                        {activeTab === 'realtime' && <RealtimeLogTab />}
                    </TabsContent>
                </Tabs>
            </PageBlock>
            </PageLayout>
        </Page>
    );
}
