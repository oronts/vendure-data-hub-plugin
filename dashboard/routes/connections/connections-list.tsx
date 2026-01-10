import * as React from 'react';
import { Button, DashboardRouteDefinition, DetailPageButton, ListPage, PageActionBarRight, PermissionGuard } from '@vendure/dashboard';
import { DATAHUB_NAV_SECTION } from '../../constants/index';
import { graphql } from '@/gql';
import { Link } from '@tanstack/react-router';

const listDocument = graphql(`
    query DataHubConnections($options: DataHubConnectionListOptions) {
        dataHubConnections(options: $options) {
            items { id code type }
            totalItems
        }
    }
`);

const deleteDocument = graphql(`
    mutation DeleteDataHubConnection($id: ID!) { deleteDataHubConnection(id: $id) { result } }
`);

export const connectionsList: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-connections',
        url: '/data-hub/connections',
        title: 'Connections',
    },
    path: '/data-hub/connections',
    loader: () => ({ breadcrumb: 'Connections' }),
    component: route => (
        <PermissionGuard requires={['ManageDataHubConnections']}>
            <ListPage
                pageId="data-hub-connections-list"
                title="Connections"
                listQuery={listDocument}
                deleteMutation={deleteDocument}
                route={route}
                customizeColumns={{
                    code: { header: 'Code', cell: ({ row }) => <DetailPageButton id={row.original.id} label={row.original.code} /> },
                    type: { header: 'Type' },
                }}
            >
                <PageActionBarRight>
                    <Button asChild><Link to="./new">New connection</Link></Button>
                </PageActionBarRight>
            </ListPage>
        </PermissionGuard>
    ),
};
