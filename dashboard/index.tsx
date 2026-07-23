import { defineDashboardExtension, DashboardRouteDefinition } from '@vendure/dashboard';
import { Boxes } from 'lucide-react';
import { DATAHUB_NAV_LABELS, DATAHUB_NAV_SECTION } from './constants';
import {
    pipelinesList,
    pipelineDetail,
    importWizardPage,
    exportWizardPage,
    adaptersList,
    secretsList,
    secretDetail,
    connectionsList,
    connectionDetail,
    hooksPage,
    queuesPage,
    settingsPage,
    logsPage,
    schemasList,
    schemaDetail,
} from './routes';
import { ErrorBoundary } from './components/shared';

function wrapWithErrorBoundary(route: DashboardRouteDefinition): DashboardRouteDefinition {
    const originalComponent = route.component;
    if (!originalComponent) return route;
    return {
        ...route,
        component: (routeArg) => (
            <ErrorBoundary>
                {originalComponent(routeArg)}
            </ErrorBoundary>
        ),
    };
}

export const dataHubRoutes: DashboardRouteDefinition[] = [
    pipelinesList,
    importWizardPage,
    exportWizardPage,
    pipelineDetail,
    adaptersList,
    secretsList,
    secretDetail,
    connectionsList,
    connectionDetail,
    hooksPage,
    queuesPage,
    settingsPage,
    logsPage,
    schemasList,
    schemaDetail,
].map(wrapWithErrorBoundary);

defineDashboardExtension({
    navSections: [
        { id: DATAHUB_NAV_SECTION, title: DATAHUB_NAV_LABELS.DATA_HUB, icon: Boxes, placement: 'bottom', order: 999 },
    ],
    routes: dataHubRoutes,
});
