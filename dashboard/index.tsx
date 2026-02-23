import { defineDashboardExtension, DashboardRouteDefinition } from '@vendure/dashboard';
import { Boxes } from 'lucide-react';
import { DATAHUB_NAV_SECTION } from './constants';
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

const routes: DashboardRouteDefinition[] = [
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
].map(wrapWithErrorBoundary);

export default defineDashboardExtension({
    navSections: [
        { id: DATAHUB_NAV_SECTION, title: 'Data Hub', icon: Boxes, placement: 'bottom', order: 999 },
    ],
    routes,
});
