import {
    Badge,
    Button,
    DashboardRouteDefinition,
    DetailPageButton,
    ListPage,
    PageActionBarRight,
    PermissionGuard,
} from '@vendure/dashboard';
import { Link } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import { graphql } from '@/gql';
import { DATAHUB_NAV_ID, DATAHUB_NAV_SECTION, DATAHUB_ROUTE_BASE } from '../../constants/index';

const getPipelines = graphql(`
    query GetDataHubPipelines($options: DataHubPipelineListOptions) {
        dataHubPipelines(options: $options) {
            items {
                id
                createdAt
                updatedAt
                code
                name
                enabled
                status
                version
            }
            totalItems
        }
    }
`);

/** Status badge colors */
const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    PUBLISHED: 'default',
    DRAFT: 'secondary',
    REVIEW: 'outline',
};

/** Pipeline entity with status and version from GraphQL query */
interface PipelineListItem {
    id: string;
    createdAt: string;
    updatedAt: string;
    code: string;
    name: string;
    enabled: boolean;
    status?: string | null;
    version?: number | null;
}

/** Status badge component */
function StatusBadge({ status }: { status?: string | null }) {
    const s = status || 'DRAFT';
    return (
        <Badge variant={STATUS_COLORS[s] ?? 'secondary'}>
            {s}
        </Badge>
    );
}

const deletePipelineDocument = graphql(`
    mutation DeleteDataHubPipeline($id: ID!) {
        deleteDataHubPipeline(id: $id) { result }
    }
`);


export const pipelinesList: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: DATAHUB_NAV_ID,
        url: DATAHUB_ROUTE_BASE,
        title: 'Pipelines',
    },
    path: DATAHUB_ROUTE_BASE,
    loader: () => ({ breadcrumb: 'Data Hub' }),
    component: route => (
        <PermissionGuard requires={['ReadDataHubPipeline']}>
            <ListPage
                pageId="data-hub-pipelines-list"
                title="Pipelines"
                listQuery={getPipelines}
                deleteMutation={deletePipelineDocument}
                route={route}
                defaultColumns={['name', 'code', 'status', 'version', 'enabled', 'createdAt']}
                customizeColumns={{
                    name: {
                        header: 'Name',
                        cell: ({ row }) => (
                            <DetailPageButton id={row.original.id} label={row.original.name} />
                        ),
                    },
                    status: {
                        header: 'Status',
                        cell: ({ row }) => <StatusBadge status={(row.original as PipelineListItem).status} />,
                    },
                    version: {
                        header: 'Version',
                        cell: ({ row }) => (
                            <span className="text-muted-foreground">
                                v{(row.original as PipelineListItem).version ?? 0}
                            </span>
                        ),
                    },
                }}
            >
                <PageActionBarRight>
                    <Button asChild>
                        <Link to="./new">
                            <PlusIcon className="mr-2 h-4 w-4" />
                            New pipeline
                        </Link>
                    </Button>
                </PageActionBarRight>
            </ListPage>
        </PermissionGuard>
    ),
};
