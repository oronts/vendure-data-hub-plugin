import { Button, DashboardRouteDefinition, DetailPageButton, ListPage, PageActionBarRight, PermissionGuard } from '@vendure/dashboard';
import { DATAHUB_NAV_SECTION, DATAHUB_PERMISSIONS, ROUTES } from '../../constants';
import { secretsListDocument, deleteSecretDocument } from '../../hooks';
import { Link } from '@tanstack/react-router';

export const secretsList: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-secrets',
        url: ROUTES.SECRETS,
        title: 'Secrets',
    },
    path: ROUTES.SECRETS,
    loader: () => ({ breadcrumb: 'Secrets' }),
    component: route => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.READ_SECRET]}>
            <ListPage
                pageId="data-hub-secrets-list"
                title="Secrets"
                listQuery={secretsListDocument}
                deleteMutation={deleteSecretDocument}
                route={route}
                customizeColumns={{
                    code: { header: 'Code', cell: ({ row }) => <DetailPageButton id={row.original.id} label={row.original.code} /> },
                    provider: { header: 'Provider' },
                }}
            >
                <PageActionBarRight>
                    <Button asChild><Link to="./new">New secret</Link></Button>
                </PageActionBarRight>
            </ListPage>
        </PermissionGuard>
    ),
};
