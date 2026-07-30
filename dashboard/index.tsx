import { defineDashboardExtension, DashboardRouteDefinition } from '@vendure/dashboard';
import { Boxes } from 'lucide-react';
import './styles.css';
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
    feedsList,
    feedDetail,
    destinationsList,
    destinationCreate,
    schemasList,
    schemaVersionCreate,
    schemaDetail,
} from './routes';
import { ConfigOptionsBoundary, ErrorBoundary } from './components/shared';

const configDrivenRoutes = new Set<DashboardRouteDefinition>([
    pipelineDetail,
    importWizardPage,
    exportWizardPage,
    adaptersList,
    connectionDetail,
    hooksPage,
    settingsPage,
    logsPage,
    feedDetail,
    destinationCreate,
    schemasList,
    schemaVersionCreate,
    schemaDetail,
]);

function wrapWithErrorBoundary(route: DashboardRouteDefinition): DashboardRouteDefinition {
    const originalComponent = route.component;
    if (!originalComponent) return route;
    return {
        ...route,
        component: (routeArg) => {
            const content = originalComponent(routeArg);
            return (
                <ErrorBoundary>
                    {configDrivenRoutes.has(route)
                        ? <ConfigOptionsBoundary>{content}</ConfigOptionsBoundary>
                        : content}
                </ErrorBoundary>
            );
        },
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
    feedsList,
    feedDetail,
    destinationsList,
    destinationCreate,
    schemasList,
    schemaVersionCreate,
    schemaDetail,
].map(wrapWithErrorBoundary);

defineDashboardExtension({
    navSections: [
        {
            id: DATAHUB_NAV_SECTION,
            title: DATAHUB_NAV_LABELS.DATA_HUB,
            icon: Boxes,
            placement: 'bottom',
            order: 999,
        },
    ],
    routes: dataHubRoutes,
});
