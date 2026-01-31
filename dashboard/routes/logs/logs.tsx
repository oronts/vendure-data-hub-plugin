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
 * Provides navigation and permission guarding.
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
 * Main logs page component that orchestrates the tab-based layout.
 * Contains three tabs:
 * - Overview: Analytics dashboard with statistics and pipeline health
 * - Log Explorer: Filterable log table with search and export
 * - Real-time Feed: Auto-refreshing live log stream
 */
function LogsPage() {
    const [activeTab, setActiveTab] = React.useState('overview');

    return (
        <Page pageId="data-hub-logs">
            <PageActionBar>
                <PageActionBarRight />
            </PageActionBar>

            <PageBlock column="main" blockId="tabs">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="mb-4">
                        <TabsTrigger value="overview" className="gap-2">
                            <BarChart3 className="w-4 h-4" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger value="logs" className="gap-2">
                            <FileText className="w-4 h-4" />
                            Log Explorer
                        </TabsTrigger>
                        <TabsTrigger value="realtime" className="gap-2">
                            <Zap className="w-4 h-4" />
                            Real-time Feed
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview">
                        <LogsOverviewTab />
                    </TabsContent>

                    <TabsContent value="logs">
                        <LogExplorerTab />
                    </TabsContent>

                    <TabsContent value="realtime">
                        <RealtimeLogTab />
                    </TabsContent>
                </Tabs>
            </PageBlock>
        </Page>
    );
}
