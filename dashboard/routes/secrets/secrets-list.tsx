import * as React from 'react';
import { Button, DashboardRouteDefinition, DetailPageButton, ListPage, PageActionBarRight, PermissionGuard } from '@vendure/dashboard';
import { DATAHUB_NAV_SECTION } from '../../constants/index';
import { graphql } from '@/gql';
import { Link } from '@tanstack/react-router';

const listDocument = graphql(`
    query DataHubSecrets($options: DataHubSecretListOptions) {
        dataHubSecrets(options: $options) {
            items { id code provider }
            totalItems
        }
    }
`);

const deleteDocument = graphql(`
    mutation DeleteDataHubSecret($id: ID!) { deleteDataHubSecret(id: $id) { result } }
`);

export const secretsList: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-secrets',
        url: '/data-hub/secrets',
        title: 'Secrets',
    },
    path: '/data-hub/secrets',
    loader: () => ({ breadcrumb: 'Secrets' }),
    component: route => (
        <PermissionGuard requires={['ReadDataHubSecret']}>
            <ListPage
                pageId="data-hub-secrets-list"
                title="Secrets"
                listQuery={listDocument}
                deleteMutation={deleteDocument}
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
