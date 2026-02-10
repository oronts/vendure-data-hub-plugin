import { Button, DashboardRouteDefinition, DetailPageButton, ListPage, PageActionBarRight, PermissionGuard } from '@vendure/dashboard';
import { DATAHUB_NAV_SECTION, DATAHUB_PERMISSIONS, ROUTES } from '../../constants';
import { connectionsListDocument, deleteConnectionDocument } from '../../hooks';
import { Link } from '@tanstack/react-router';

export const connectionsList: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-connections',
        url: ROUTES.CONNECTIONS,
        title: 'Connections',
    },
    path: ROUTES.CONNECTIONS,
    loader: () => ({ breadcrumb: 'Connections' }),
    component: route => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.MANAGE_CONNECTIONS]}>
            <ListPage
                pageId="data-hub-connections-list"
                title="Connections"
                listQuery={connectionsListDocument}
                deleteMutation={deleteConnectionDocument}
                route={route}
                customizeColumns={{
                    code: { header: 'Code', cell: ({ row }) => <DetailPageButton id={row.original.id} label={row.original.code} /> },
                    type: { header: 'Type' },
                }}
            >
                <PageActionBarRight>
                    <Button asChild data-testid="datahub-connection-create-button"><Link to="./new">New connection</Link></Button>
                </PageActionBarRight>
            </ListPage>
        </PermissionGuard>
    ),
};
