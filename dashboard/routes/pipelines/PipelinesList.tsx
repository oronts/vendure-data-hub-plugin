import {
    Badge,
    buttonVariants,
    DashboardRouteDefinition,
    ListPage,
    PageActionBarRight,
    PermissionGuard,
    usePermissions,
} from '@vendure/dashboard';
import { Trans, useLingui } from '@lingui/react/macro';

import { Link } from '@tanstack/react-router';
import { Download, PlusIcon, Upload } from 'lucide-react';
import type { CellContext } from '@tanstack/react-table';
import type { VariablesOf } from '@graphql-typed-document-node/core';
import {
    COMMON_VALUE_TRANSLATION_IDS,
    DATAHUB_NAV_ID,
    DATAHUB_NAV_LABELS,
    DATAHUB_NAV_SECTION,
    DATAHUB_PAGE_LABELS,
    DATAHUB_PERMISSIONS,
    DETAIL_ROUTES,
    PIPELINE_STATUS,
    ROUTES,
} from '../../constants';
import { pipelinesListDocument, deletePipelineDocument } from '../../hooks';
import type {
    DataHubPipelinesForListQuery,
} from '../../gql/graphql';
import {
    AllPermissionsGuard,
    DetailRouteButton,
    PipelineCapabilityBadges,
    PipelineStatusBadge,
} from '../../components/shared';
import { CONFIGURATION_SOURCE } from '../../../shared';

type PipelineListItem = DataHubPipelinesForListQuery['dataHubPipelines']['items'][number];

export const pipelinesList: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: DATAHUB_NAV_ID,
        url: ROUTES.PIPELINES,
        title: DATAHUB_NAV_LABELS.PIPELINES,
        requiresPermission: DATAHUB_PERMISSIONS.READ_PIPELINE,
    },
    path: ROUTES.PIPELINES,
    loader: () => ({ breadcrumb: DATAHUB_NAV_LABELS.PIPELINES }),
    component: route => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.READ_PIPELINE]}>
            <PipelinesListPage route={route} />
        </PermissionGuard>
    ),
};

type DashboardRoute = Parameters<DashboardRouteDefinition['component']>[0];

function PipelinesListPage({ route }: { route: DashboardRoute }) {
    const { i18n, t } = useLingui();
    const { hasPermissions } = usePermissions();
    const canDelete = hasPermissions([DATAHUB_PERMISSIONS.DELETE_PIPELINE]);

    return (
        <div className="data-hub-responsive-page">
            <ListPage<
                typeof pipelinesListDocument,
                DataHubPipelinesForListQuery,
                VariablesOf<typeof pipelinesListDocument>
            >
                pageId="data-hub-pipelines-list"
                title={i18n._(DATAHUB_NAV_LABELS.PIPELINES)}
                listQuery={pipelinesListDocument}
                deleteMutation={canDelete ? deletePipelineDocument : undefined}
                route={route}
                defaultColumnOrder={['name', 'code', 'status', 'requiredCapabilities', 'publishedVersionCount', 'enabled', 'createdAt']}
                customizeColumns={{
                    name: {
                        header: t`Name`,
                        meta: { dependencies: ['configurationSource'] },
                        cell: ({ row }: CellContext<PipelineListItem, unknown>) => (
                            <div className="flex items-center gap-2">
                                <DetailRouteButton
                                    route={DETAIL_ROUTES.PIPELINE}
                                    id={row.original.id}
                                    label={row.original.name}
                                />
                                {row.original.configurationSource === CONFIGURATION_SOURCE.CODE_FIRST && (
                                    <Badge variant="outline" className="text-xs">
                                        <Trans>Code-first</Trans>
                                    </Badge>
                                )}
                            </div>
                        ),
                    },
                    status: {
                        header: t`Status`,
                        cell: ({ row }: CellContext<PipelineListItem, unknown>) => (
                            <PipelineStatusBadge status={row.original.status} />
                        ),
                    },
                    requiredCapabilities: {
                        header: () => <Trans>Capabilities</Trans>,
                        meta: { dependencies: ['writeCapabilities'] },
                        cell: ({ row }: CellContext<PipelineListItem, unknown>) => (
                            <PipelineCapabilityBadges
                                requiredCapabilities={row.original.requiredCapabilities}
                                writeCapabilities={row.original.writeCapabilities}
                            />
                        ),
                    },
                    publishedVersionCount: {
                        header: () => <Trans>Published revision</Trans>,
                        meta: { dependencies: ['currentRevisionId'] },
                        cell: ({ row }: CellContext<PipelineListItem, unknown>) => {
                            const publishedVersion = row.original.publishedVersionCount;
                            return (
                                <span className="text-muted-foreground">
                                    {row.original.currentRevisionId
                                        ? row.original.status === PIPELINE_STATUS.ARCHIVED
                                            ? <Trans>Last published v{publishedVersion}</Trans>
                                            : <Trans>Published v{publishedVersion}</Trans>
                                        : <Trans>Not published</Trans>}
                                </span>
                            );
                        },
                    },
                    enabled: {
                        header: t`Enabled`,
                        cell: ({ row }: CellContext<PipelineListItem, unknown>) => i18n._(
                            row.original.enabled
                                ? COMMON_VALUE_TRANSLATION_IDS.ENABLED
                                : COMMON_VALUE_TRANSLATION_IDS.DISABLED,
                        ),
                    },
                    configurationSource: { meta: { disabled: true } },
                    version: { meta: { disabled: true } },
                    currentRevisionId: { meta: { disabled: true } },
                    writeCapabilities: { meta: { disabled: true } },
                }}
            >
                <PageActionBarRight>
                    <div className="data-hub-pipeline-actions">
                        <AllPermissionsGuard requires={[
                            DATAHUB_PERMISSIONS.CREATE_PIPELINE,
                            DATAHUB_PERMISSIONS.READ_PIPELINE,
                            DATAHUB_PERMISSIONS.VIEW_ENTITY_SCHEMAS,
                            DATAHUB_PERMISSIONS.MANAGE_ADAPTERS,
                        ]}>
                            <Link
                                className={buttonVariants({ variant: 'outline' })}
                                data-testid="datahub-import-wizard-button"
                                to="./import-wizard"
                                aria-label={i18n._(DATAHUB_PAGE_LABELS.IMPORT_WIZARD)}
                            >
                                <Upload className="data-hub-action-icon mr-2 h-4 w-4" />
                                <span className="data-hub-action-label">
                                    {i18n._(DATAHUB_PAGE_LABELS.IMPORT_WIZARD)}
                                </span>
                            </Link>
                        </AllPermissionsGuard>
                        <AllPermissionsGuard requires={[
                            DATAHUB_PERMISSIONS.CREATE_PIPELINE,
                            DATAHUB_PERMISSIONS.READ_PIPELINE,
                            DATAHUB_PERMISSIONS.VIEW_ENTITY_SCHEMAS,
                        ]}>
                            <Link
                                className={buttonVariants({ variant: 'outline' })}
                                data-testid="datahub-export-wizard-button"
                                to="./export-wizard"
                                aria-label={i18n._(DATAHUB_PAGE_LABELS.EXPORT_WIZARD)}
                            >
                                <Download className="data-hub-action-icon mr-2 h-4 w-4" />
                                <span className="data-hub-action-label">
                                    {i18n._(DATAHUB_PAGE_LABELS.EXPORT_WIZARD)}
                                </span>
                            </Link>
                        </AllPermissionsGuard>
                        <PermissionGuard requires={[DATAHUB_PERMISSIONS.CREATE_PIPELINE]}>
                            <Link
                                className={buttonVariants()}
                                data-testid="datahub-pipeline-create-button"
                                to={DETAIL_ROUTES.PIPELINE}
                                params={{ id: 'new' }}
                                aria-label={i18n._(DATAHUB_PAGE_LABELS.NEW_PIPELINE)}
                            >
                                <PlusIcon className="data-hub-action-icon mr-2 h-4 w-4" />
                                <span className="data-hub-action-label">
                                    {i18n._(DATAHUB_PAGE_LABELS.NEW_PIPELINE)}
                                </span>
                            </Link>
                        </PermissionGuard>
                    </div>
                </PageActionBarRight>
            </ListPage>
        </div>
    );
}
