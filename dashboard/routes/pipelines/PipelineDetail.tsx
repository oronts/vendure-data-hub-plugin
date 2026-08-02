import * as React from 'react';
import {
    Button,
    DashboardRouteDefinition,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    PageLayout,
    PageTitle,
    PermissionGuard,
    api,
    detailPageRouteLoader,
    useDetailPage,
    usePermissions,
} from '@vendure/dashboard';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trans, useLingui } from '@lingui/react/macro';

import { AlertCircle } from 'lucide-react';
import { CONFIGURATION_SOURCE, getErrorMessage } from '../../../shared';
import {
    DATAHUB_NAV_LABELS,
    DATAHUB_PAGE_LABELS,
    DATAHUB_PERMISSIONS,
    DETAIL_ROUTES,
    PIPELINE_STATUS,
    ROUTES,
} from '../../constants';
import {
    createPipelineDocument,
    assignPipelinesToChannelDocument,
    pipelineDetailDocument,
    removePipelinesFromChannelDocument,
    updatePipelineDocument,
    pipelineKeys,
} from '../../hooks';
import type { PipelineDefinition, PipelineEntity } from '../../types';
import { PipelineRunsBlock } from './PipelineRunsBlock';
import {
    DryRunDialog,
    VersionHistoryDialog,
    ValidationPanel,
    PipelineActionButtons,
    PipelineWebhookInfo,
    PipelineEditorToggle,
    PipelineFormFields,
    ReviewActionsPanel,
} from './components';
import { usePipelineValidation } from './hooks';
import { getEntityLabel } from '../../utils';
import { AllPermissionsGuard, ManagedResourceChannels } from '../../components/shared';
import type { AppliedPipelineRevision } from '../../hooks/api/use-pipeline-revisions';

const PIPELINE_DETAIL_PAGE_ID = 'data-hub-pipeline-detail';

export const pipelineDetail: DashboardRouteDefinition = {
    path: DETAIL_ROUTES.PIPELINE,
    loader: detailPageRouteLoader({
        pageId: PIPELINE_DETAIL_PAGE_ID,
        queryDocument: pipelineDetailDocument,
        breadcrumb: (isNew, entity) => [
            { path: ROUTES.PIPELINES, label: DATAHUB_NAV_LABELS.PIPELINES },
            isNew
                ? DATAHUB_PAGE_LABELS.NEW_PIPELINE
                : <>{getEntityLabel(entity, 'name')}</>,
        ],
    }),
    component: route => <PipelineDetailPermissionGate route={route} />,
};

type DashboardRoute = Parameters<DashboardRouteDefinition['component']>[0];

function PipelineDetailPermissionGate({ route }: { route: DashboardRoute }) {
    const params = route.useParams();
    const requiredPermissions = params.id === 'new'
        ? [DATAHUB_PERMISSIONS.CREATE_PIPELINE, DATAHUB_PERMISSIONS.READ_PIPELINE]
        : [DATAHUB_PERMISSIONS.READ_PIPELINE];

    return (
        <AllPermissionsGuard requires={requiredPermissions}>
            <PipelineDetailPage route={route} />
        </AllPermissionsGuard>
    );
}

function PipelineDetailPage({ route }: { route: DashboardRoute }) {
    const { i18n, t } = useLingui();
    const params = route.useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const creating = params.id === 'new';
    const { hasPermissions } = usePermissions();
    const hasEditPermission = hasPermissions([
        creating
            ? DATAHUB_PERMISSIONS.CREATE_PIPELINE
            : DATAHUB_PERMISSIONS.UPDATE_PIPELINE,
    ]);

    const { form, submitHandler, entity, isPending, resetForm, refreshEntity } = useDetailPage({
        pageId: PIPELINE_DETAIL_PAGE_ID,
        queryDocument: pipelineDetailDocument,
        entityField: 'dataHubPipeline',
        createDocument: createPipelineDocument,
        updateDocument: updatePipelineDocument,
        setValuesForUpdate: p => ({
            id: p?.id ?? '',
            code: p?.code ?? '',
            name: p?.name ?? '',
            enabled: p?.enabled ?? true,
            version: p?.version ?? 1,
            definition: p?.definition ?? {},
        }),
        params: { id: params.id },
        onSuccess: data => {
            toast.success(t`Successfully saved pipeline`);
            resetForm();
            if (creating && typeof data === 'object' && data !== null && 'id' in data) {
                void navigate({ to: `../$id`, params: { id: data.id } }).catch(error => {
                    toast.error(t`Pipeline saved, but navigation failed`, {
                        description: getErrorMessage(error),
                    });
                });
            }
        },
        onError: err => {
            toast.error(t`Failed to save pipeline`, {
                description: getErrorMessage(err),
            });
        },
    });

    // Dialog states
    const [dryRunOpen, setDryRunOpen] = React.useState(false);
    const [historyOpen, setHistoryOpen] = React.useState(false);
    const [issuesOpen, setIssuesOpen] = React.useState(false);

    // Validation
    const watchedDefinition = form.watch('definition');
    const { validation, validationPending } = usePipelineValidation(watchedDefinition);

    // Callbacks
    const handleImport = React.useCallback((def: PipelineDefinition) => {
        form.setValue('definition', { ...def }, { shouldDirty: true });
    }, [form]);

    const refreshPipeline = React.useCallback(() => {
        void Promise.all([
            queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() }),
            refreshEntity(),
        ]).catch(error => {
            toast.error(t`Failed to refresh pipeline`, {
                description: getErrorMessage(error),
            });
        });
    }, [queryClient, refreshEntity, t]);

    const handleStatusChange = refreshPipeline;

    const handleRevisionApplied = React.useCallback((
        pipeline: AppliedPipelineRevision,
    ) => {
        form.reset({
            id: String(pipeline.id),
            code: pipeline.code,
            name: pipeline.name,
            enabled: pipeline.enabled,
            version: pipeline.version,
            definition: pipeline.definition
                && typeof pipeline.definition === 'object'
                && !Array.isArray(pipeline.definition)
                ? pipeline.definition as Record<string, unknown>
                : {},
        });
        setHistoryOpen(false);
        refreshPipeline();
    }, [form, refreshPipeline]);

    // Scroll to runs section if hash is #runs
    React.useEffect(() => {
        if (typeof window !== 'undefined' && window.location.hash === '#runs') {
            const el = document.getElementById('runs');
            if (el) {
                try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { el.scrollIntoView(); }
            }
        }
    }, []);

    const pipelineEntity = entity as PipelineEntity | undefined;
    const managedByCodeFirst = !creating
        && pipelineEntity?.configurationSource === CONFIGURATION_SOURCE.CODE_FIRST;
    const canEditPipeline = hasEditPermission && !managedByCodeFirst;
    const pipelineId = entity?.id == null ? undefined : String(entity.id);
    const validationErrorTitle = validation.count === 1
        ? t`Cannot save: ${validation.count} validation error`
        : t`Cannot save: ${validation.count} validation errors`;

    return (
        <>
            <Page
                pageId={PIPELINE_DETAIL_PAGE_ID}
                form={form}
                submitHandler={submitHandler}
                entity={entity}
            >
                <PageTitle>
                    {creating
                        ? i18n._(DATAHUB_PAGE_LABELS.NEW_PIPELINE)
                        : entity?.name ?? ''}
                </PageTitle>
                <PageActionBar>
                    <PageActionBarRight>
                        <PermissionGuard requires={[
                            creating
                                ? DATAHUB_PERMISSIONS.CREATE_PIPELINE
                                : DATAHUB_PERMISSIONS.UPDATE_PIPELINE,
                        ]}>
                            <Button
                                type="submit"
                                disabled={
                                    !form.formState.isDirty ||
                                    !form.formState.isValid ||
                                    isPending ||
                                    validationPending ||
                                    validation.isValid === false
                                    || managedByCodeFirst
                                }
                                title={validation.isValid === false
                                    ? validationErrorTitle
                                    : undefined}
                            >
                                {creating ? <Trans>Create</Trans> : <Trans>Update</Trans>}
                            </Button>
                        </PermissionGuard>
                        <PipelineActionButtons
                            entityId={pipelineId}
                            status={pipelineEntity?.status}
                            enabled={pipelineEntity?.enabled}
                            currentRevisionId={pipelineEntity?.currentRevisionId}
                            publishedVersionCount={pipelineEntity?.publishedVersionCount}
                            definition={form.getValues('definition') as PipelineDefinition | undefined}
                            creating={creating}
                            hasUnsavedChanges={form.formState.isDirty}
                            managedByCodeFirst={managedByCodeFirst}
                            onImport={handleImport}
                            onOpenDryRun={() => setDryRunOpen(true)}
                            onOpenHistory={() => setHistoryOpen(true)}
                        />
                    </PageActionBarRight>
                </PageActionBar>
                <PageLayout>
                    <PageBlock column="main" blockId="main-form">
                        {managedByCodeFirst && (
                            <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-500/10 p-3">
                                <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
                                <div className="text-sm">
                                    <p className="font-medium">
                                        <Trans>Managed by code-first configuration</Trans>
                                    </p>
                                    <p className="text-muted-foreground">
                                        <Trans>Edit the deployed definition and restart the application. Review and publish remain available; removing the definition releases this pipeline to Dashboard ownership without deleting its history.</Trans>
                                    </p>
                                </div>
                            </div>
                        )}
                        <PipelineFormFields
                            control={form.control}
                            creating={creating}
                            readOnly={!canEditPipeline}
                            entity={pipelineEntity}
                            validation={validation}
                            validationPending={validationPending}
                            onShowIssues={() => setIssuesOpen(true)}
                        />
                        {!creating && (
                            <div className="mt-6">
                                <ReviewActionsPanel
                                    entityId={pipelineId}
                                    status={pipelineEntity?.status}
                                    enabled={pipelineEntity?.enabled}
                                    currentRevisionId={pipelineEntity?.currentRevisionId}
                                    publishedVersionCount={pipelineEntity?.publishedVersionCount}
                                    onStatusChange={handleStatusChange}
                                    hasUnsavedChanges={form.formState.isDirty}
                                    managedByCodeFirst={managedByCodeFirst}
                                />
                            </div>
                        )}
                        <PipelineEditorToggle
                            definition={form.watch('definition')}
                            onChange={definition => {
                                form.setValue('definition', { ...definition }, { shouldDirty: true });
                            }}
                            issues={validation.issues}
                            readOnly={!canEditPipeline}
                        />
                        <PipelineWebhookInfo
                            definition={form.watch('definition') as PipelineDefinition | undefined}
                            pipelineCode={form.watch('code')}
                        />
                    </PageBlock>
                    {entity && (
                        <PageBlock column="main" blockId="pipeline-channels">
                            <ManagedResourceChannels
                                channels={entity.channels}
                                entityLabel={entity.name}
                                canUpdate={hasEditPermission}
                                onAssign={channelId => api.mutate(
                                    assignPipelinesToChannelDocument,
                                    { input: { pipelineIds: [String(entity.id)], channelId } },
                                )}
                                onRemove={channelId => api.mutate(
                                    removePipelinesFromChannelDocument,
                                    { input: { pipelineIds: [String(entity.id)], channelId } },
                                )}
                                onChanged={refreshEntity}
                            />
                        </PageBlock>
                    )}
                </PageLayout>
                {!creating && (
                    <PipelineRunsBlock
                        pipelineId={pipelineId}
                        currentRevisionId={pipelineEntity?.currentRevisionId}
                        canRunPublishedRevision={
                            pipelineEntity?.enabled !== false
                            && pipelineEntity?.status !== PIPELINE_STATUS.ARCHIVED
                            && pipelineEntity?.currentRevisionId != null
                        }
                    />
                )}
            </Page>

            <ValidationPanel
                validation={validation}
                isLoading={validationPending}
                open={issuesOpen}
                onOpenChange={setIssuesOpen}
            />

            <DryRunDialog
                open={dryRunOpen}
                onOpenChange={setDryRunOpen}
                pipelineId={pipelineId}
            />

            <VersionHistoryDialog
                open={historyOpen}
                onOpenChange={setHistoryOpen}
                pipelineId={pipelineId}
                pipelineStatus={pipelineEntity?.status}
                hasUnsavedChanges={form.formState.isDirty}
                readOnly={managedByCodeFirst}
                onRevisionApplied={handleRevisionApplied}
            />
        </>
    );
}
