import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
import {
    Badge,
    Button,
    Card,
    CardContent,
    ConfirmationDialog,
    DashboardRouteDefinition,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    PageLayout,
    PageTitle,
    PermissionGuard,
    useChannel,
} from '@vendure/dashboard';
import { Link } from '@tanstack/react-router';
import { FlaskConical, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '../../../shared';
import { EmptyState, ErrorState, LoadingState } from '../../components/shared';
import {
    DATAHUB_NAV_LABELS,
    DATAHUB_NAV_SECTION,
    DATAHUB_PERMISSIONS,
    ROUTES,
} from '../../constants';
import {
    useDeleteExportDestination,
    useExportDestinations,
    useTestExportDestination,
} from '../../hooks/api/use-destinations';

export const destinationsList: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-destinations',
        url: ROUTES.DESTINATIONS,
        title: DATAHUB_NAV_LABELS.DESTINATIONS,
        requiresPermission: DATAHUB_PERMISSIONS.MANAGE_DESTINATIONS,
    },
    path: ROUTES.DESTINATIONS,
    loader: () => ({ breadcrumb: DATAHUB_NAV_LABELS.DESTINATIONS }),
    component: () => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.MANAGE_DESTINATIONS]}>
            <DestinationsListPage />
        </PermissionGuard>
    ),
};

function DestinationsListPage() {
    const { t } = useLingui();
    const { activeChannel } = useChannel();
    const destinationsQuery = useExportDestinations();
    const testDestination = useTestExportDestination();
    const deleteDestination = useDeleteExportDestination();
    const destinations = destinationsQuery.data ?? [];

    const handleTest = React.useCallback((id: string) => {
        testDestination.mutate(id, {
            onSuccess: result => {
                const description = result.latencyMs == null
                    ? result.message
                    : t`${result.message} (${result.latencyMs} ms)`;
                if (result.success) {
                    toast.success(t`Destination test passed`, {
                        description,
                    });
                } else {
                    toast.error(t`Destination test failed`, {
                        description,
                    });
                }
            },
            onError: error => toast.error(t`Destination test failed`, {
                description: getErrorMessage(error),
            }),
        });
    }, [t, testDestination]);

    const handleDelete = React.useCallback((id: string) => {
        deleteDestination.mutate(id, {
            onSuccess: result => {
                if (result.result === 'DELETED') {
                    toast.success(t`Destination deleted`);
                } else {
                    toast.error(t`Destination was not deleted`, {
                        description: result.message ?? undefined,
                    });
                }
            },
            onError: error => toast.error(t`Failed to delete destination`, {
                description: getErrorMessage(error),
            }),
        });
    }, [deleteDestination, t]);

    const handleRefresh = React.useCallback(() => {
        void destinationsQuery.refetch();
    }, [destinationsQuery]);

    return (
        <Page pageId="data-hub-destinations-list">
            <PageTitle>{t`Destinations`}</PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    <Button
                        variant="ghost"
                        onClick={handleRefresh}
                        disabled={destinationsQuery.isFetching}
                        aria-label={t`Refresh destinations`}
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${destinationsQuery.isFetching ? 'animate-spin' : ''}`} />
                        {t`Refresh`}
                    </Button>
                    <Button asChild>
                        <Link to={`${ROUTES.DESTINATIONS}/new`}>
                            <Plus className="w-4 h-4 mr-2" />
                            {t`New destination`}
                        </Link>
                    </Button>
                </PageActionBarRight>
            </PageActionBar>

            <PageLayout>
            <PageBlock column="main" blockId="destinations">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold">
                        {t`Managed destinations`}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {t`Channel`}:{' '}
                        {activeChannel?.code ?? t`Loading channel...`}
                    </p>
                </div>

                {destinationsQuery.isError && (
                    <ErrorState
                        title={t`Failed to load destinations`}
                        message={getErrorMessage(destinationsQuery.error)}
                        onRetry={handleRefresh}
                    />
                )}

                {destinationsQuery.isLoading && (
                    <LoadingState
                        type="table"
                        rows={4}
                        message={t`Loading destinations...`}
                    />
                )}

                {!destinationsQuery.isLoading && !destinationsQuery.isError && destinations.length === 0 && (
                    <Card>
                        <CardContent>
                            <EmptyState
                                icon={<Send className="w-10 h-10" />}
                                title={t`No managed destinations`}
                                description={t`Create a destination to deliver exported data for this channel.`}
                            />
                            <div className="flex justify-center pb-8">
                                <Button asChild>
                                    <Link to={`${ROUTES.DESTINATIONS}/new`}>
                                        {t`Create destination`}
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {!destinationsQuery.isLoading && !destinationsQuery.isError && destinations.length > 0 && (
                    <Card>
                        <CardContent className="p-0 overflow-x-auto">
                            <table className="w-full text-sm">
                                <caption className="sr-only">
                                    {t`Managed destinations for channel ${activeChannel?.code ?? ''}`}
                                </caption>
                                <thead>
                                    <tr className="border-b bg-muted/40">
                                        <th scope="col" className="text-left px-4 py-3 font-medium">
                                            {t`Name`}
                                        </th>
                                        <th scope="col" className="text-left px-4 py-3 font-medium">
                                            {t`ID`}
                                        </th>
                                        <th scope="col" className="text-left px-4 py-3 font-medium">
                                            {t`Type`}
                                        </th>
                                        <th scope="col" className="text-left px-4 py-3 font-medium">
                                            {t`Status`}
                                        </th>
                                        <th scope="col" className="text-right px-4 py-3 font-medium">
                                            {t`Actions`}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {destinations.map(destination => {
                                        const testing = testDestination.isPending
                                            && testDestination.variables === destination.id;
                                        const deleting = deleteDestination.isPending
                                            && deleteDestination.variables === destination.id;
                                        return (
                                            <tr key={destination.id} className="border-b last:border-b-0">
                                                <td className="px-4 py-3 font-medium">{destination.name}</td>
                                                <td className="px-4 py-3 font-mono text-muted-foreground">{destination.id}</td>
                                                <td className="px-4 py-3"><Badge variant="outline">{destination.type}</Badge></td>
                                                <td className="px-4 py-3">
                                                    <Badge variant={destination.enabled ? 'default' : 'secondary'}>
                                                        {destination.enabled ? t`Enabled` : t`Disabled`}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleTest(destination.id)}
                                                            disabled={testing || deleting}
                                                            aria-label={t`Test destination ${destination.name}`}
                                                        >
                                                            <FlaskConical className="w-4 h-4 mr-2" />
                                                            {testing ? t`Testing...` : t`Test`}
                                                        </Button>
                                                        <ConfirmationDialog
                                                            title={t`Delete destination ${destination.name}?`}
                                                            description={t`This destination configuration will be permanently deleted.`}
                                                            confirmText={t`Delete destination`}
                                                            onConfirm={() => handleDelete(destination.id)}
                                                        >
                                                            <Button
                                                                variant="destructive"
                                                                size="sm"
                                                                disabled={testing || deleting}
                                                                aria-label={t`Delete destination ${destination.name}`}
                                                            >
                                                                <Trash2 className="w-4 h-4 mr-2" />
                                                                {deleting ? t`Deleting...` : t`Delete`}
                                                            </Button>
                                                        </ConfirmationDialog>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                )}
            </PageBlock>
            </PageLayout>
        </Page>
    );
}
