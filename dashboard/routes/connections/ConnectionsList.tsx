import { Badge, buttonVariants, DashboardRouteDefinition, ListPage, PageActionBarRight, PermissionGuard } from '@vendure/dashboard';
import { Trans, useLingui } from '@lingui/react/macro';
import { DATAHUB_NAV_LABELS, DATAHUB_NAV_SECTION, DATAHUB_PAGE_LABELS, DATAHUB_PERMISSIONS, DETAIL_ROUTES, ROUTES } from '../../constants';
import { connectionsListDocument, deleteConnectionDocument } from '../../hooks';
import { Link } from '@tanstack/react-router';
import type { CellContext } from '@tanstack/react-table';
import type { VariablesOf } from '@graphql-typed-document-node/core';
import type {
    DataHubConnectionsForListQuery,
} from '../../gql/graphql';
import { DetailRouteButton } from '../../components/shared';
import { CONFIGURATION_SOURCE } from '../../../shared';

type ConnectionListItem = DataHubConnectionsForListQuery['dataHubConnections']['items'][number];
type ConnectionsRoute = Parameters<DashboardRouteDefinition['component']>[0];

export const connectionsList: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-connections',
        url: ROUTES.CONNECTIONS,
        title: DATAHUB_NAV_LABELS.CONNECTIONS,
        requiresPermission: DATAHUB_PERMISSIONS.MANAGE_CONNECTIONS,
    },
    path: ROUTES.CONNECTIONS,
    loader: () => ({ breadcrumb: DATAHUB_NAV_LABELS.CONNECTIONS }),
    component: route => <ConnectionsListPage route={route} />,
};

function ConnectionsListPage({ route }: { route: ConnectionsRoute }) {
    const { i18n, t } = useLingui();

    return (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.MANAGE_CONNECTIONS]}>
            <ListPage<
                typeof connectionsListDocument,
                DataHubConnectionsForListQuery,
                VariablesOf<typeof connectionsListDocument>
            >
                pageId="data-hub-connections-list"
                title={i18n._(DATAHUB_NAV_LABELS.CONNECTIONS)}
                listQuery={connectionsListDocument}
                deleteMutation={deleteConnectionDocument}
                route={route}
                customizeColumns={{
                    code: {
                        header: t`Code`,
                        meta: { dependencies: ['configurationSource'] },
                        cell: ({ row }: CellContext<ConnectionListItem, unknown>) => (
                            <div className="flex items-center gap-2">
                                <DetailRouteButton
                                    route={DETAIL_ROUTES.CONNECTION}
                                    id={row.original.id}
                                    label={row.original.code}
                                />
                                {row.original.configurationSource === CONFIGURATION_SOURCE.CODE_FIRST && (
                                    <Badge variant="outline" className="text-xs">
                                        <Trans>Code-first</Trans>
                                    </Badge>
                                )}
                            </div>
                        ),
                    },
                    type: { header: t`Type` },
                    configurationSource: { meta: { disabled: true } },
                }}
            >
                <PageActionBarRight>
                    <Link
                        className={buttonVariants()}
                        data-testid="datahub-connection-create-button"
                        to={DETAIL_ROUTES.CONNECTION}
                        params={{ id: 'new' }}
                    >
                        {i18n._(DATAHUB_PAGE_LABELS.NEW_CONNECTION)}
                    </Link>
                </PageActionBarRight>
            </ListPage>
        </PermissionGuard>
    );
}
