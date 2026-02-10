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
import { DATAHUB_NAV_ID, DATAHUB_NAV_SECTION, DATAHUB_PERMISSIONS, ROUTES, getStatusBadgeVariant, PIPELINE_STATUS } from '../../constants';
import { pipelinesListDocument, deletePipelineDocument } from '../../hooks';
import type { DataHubPipeline } from '../../types';

function StatusBadge({ status }: { status?: string | null }) {
    const pipelineStatus = status || PIPELINE_STATUS.DRAFT;
    return (
        <Badge variant={getStatusBadgeVariant(pipelineStatus)}>
            {pipelineStatus}
        </Badge>
    );
}

export const pipelinesList: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: DATAHUB_NAV_ID,
        url: ROUTES.PIPELINES,
        title: 'Pipelines',
    },
    path: ROUTES.PIPELINES,
    loader: () => ({ breadcrumb: 'Data Hub' }),
    component: route => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.READ_PIPELINE]}>
            <ListPage
                pageId="data-hub-pipelines-list"
                title="Pipelines"
                listQuery={pipelinesListDocument}
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
                        cell: ({ row }) => <StatusBadge status={(row.original as DataHubPipeline).status} />,
                    },
                    version: {
                        header: 'Version',
                        cell: ({ row }) => (
                            <span className="text-muted-foreground">
                                v{(row.original as DataHubPipeline).version ?? 0}
                            </span>
                        ),
                    },
                }}
            >
                <PageActionBarRight>
                    <Button asChild data-testid="datahub-pipeline-create-button">
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
