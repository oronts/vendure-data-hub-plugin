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
    detailPageRouteLoader,
    useDetailPage,
} from '@vendure/dashboard';
import { AnyRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DATAHUB_PERMISSIONS, ROUTES, TOAST_PIPELINE } from '../../constants';
import {
    createPipelineDocument,
    pipelineDetailDocument,
    updatePipelineDocument,
    pipelineKeys,
} from '../../hooks';
import type { PipelineDefinition, ValidationIssue, PipelineEntity } from '../../types';
import { PipelineRunsBlock } from './pipeline-runs';
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

export const pipelineDetail: DashboardRouteDefinition = {
    path: `${ROUTES.PIPELINES}/$id`,
    loader: detailPageRouteLoader({
        queryDocument: pipelineDetailDocument,
        breadcrumb: (isNew, entity) => [
            { path: ROUTES.PIPELINES, label: 'Data Hub' },
            isNew ? 'New pipeline' : entity?.name,
        ],
    }),
    component: route => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.READ_PIPELINE]}>
            <PipelineDetailPage route={route} />
        </PermissionGuard>
    ),
};

function PipelineDetailPage({ route }: { route: AnyRoute }) {
    const params = route.useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const creating = params.id === 'new';

    const { form, submitHandler, entity, isPending, resetForm } = useDetailPage({
        queryDocument: pipelineDetailDocument,
        createDocument: createPipelineDocument,
        updateDocument: updatePipelineDocument,
        setValuesForCreate: () => ({
            code: '',
            name: '',
            enabled: true,
            definition: { steps: [] },
        }),
        setValuesForUpdate: p => ({
            id: p?.id ?? '',
            code: p?.code ?? '',
            name: p?.name ?? '',
            enabled: p?.enabled ?? true,
            definition: p?.definition ?? {},
        }),
        params: { id: params.id },
        onSuccess: async data => {
            toast.success(TOAST_PIPELINE.SAVE_SUCCESS);
            resetForm();
            if (creating) {
                await navigate({ to: `../$id`, params: { id: data.id } });
            }
        },
        onError: err => {
            toast.error(TOAST_PIPELINE.SAVE_ERROR, {
                description: err instanceof Error ? err.message : 'Unknown error',
            });
        },
    });

    // Dialog states
    const [dryRunOpen, setDryRunOpen] = React.useState(false);
    const [historyOpen, setHistoryOpen] = React.useState(false);
    const [issuesOpen, setIssuesOpen] = React.useState(false);

    // Validation
    const watchedDefinition = form.watch('definition');
    const { validation, validationPending, setValidation } = usePipelineValidation(watchedDefinition);

    // Callbacks
    const handleImport = React.useCallback((def: PipelineDefinition) => {
        form.setValue('definition', def, { shouldDirty: true });
    }, [form]);

    const handleValidationFailed = React.useCallback((issues: ValidationIssue[]) => {
        setValidation({ isValid: false, count: issues.length, issues, warnings: [] });
        setIssuesOpen(true);
    }, [setValidation]);

    const handleStatusChange = React.useCallback(() => {
        queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() });
        if (params.id && params.id !== 'new') {
            queryClient.invalidateQueries({ queryKey: pipelineKeys.detail(String(params.id)) });
        }
    }, [queryClient, params.id]);

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

    return (
        <>
            <Page pageId="data-hub-pipeline-detail" form={form} submitHandler={submitHandler}>
                <PageTitle>{creating ? 'New pipeline' : entity?.name ?? ''}</PageTitle>
                <PageActionBar>
                    <PageActionBarRight>
                        <PermissionGuard requires={[DATAHUB_PERMISSIONS.UPDATE_PIPELINE]}>
                            <Button
                                type="submit"
                                disabled={
                                    !form.formState.isDirty ||
                                    !form.formState.isValid ||
                                    isPending ||
                                    validationPending ||
                                    validation.isValid === false
                                }
                                title={validation.isValid === false ? `Cannot save: ${validation.count} validation error(s)` : undefined}
                            >
                                {creating ? 'Create' : 'Update'}
                            </Button>
                        </PermissionGuard>
                        <PipelineActionButtons
                            entityId={entity?.id}
                            status={pipelineEntity?.status}
                            definition={form.getValues('definition') as PipelineDefinition | undefined}
                            creating={creating}
                            onImport={handleImport}
                            onOpenDryRun={() => setDryRunOpen(true)}
                            onOpenHistory={() => setHistoryOpen(true)}
                            onValidationFailed={handleValidationFailed}
                            onStatusChange={handleStatusChange}
                        />
                    </PageActionBarRight>
                </PageActionBar>
                <PageLayout>
                    <PageBlock column="main" blockId="main-form">
                        <PipelineFormFields
                            form={form}
                            creating={creating}
                            entity={pipelineEntity}
                            validation={validation}
                            validationPending={validationPending}
                            onShowIssues={() => setIssuesOpen(true)}
                        />
                        {!creating && (
                            <PermissionGuard requires={[DATAHUB_PERMISSIONS.UPDATE_PIPELINE]}>
                                <div className="mt-6">
                                    <ReviewActionsPanel
                                        entityId={entity?.id}
                                        status={pipelineEntity?.status}
                                        onStatusChange={handleStatusChange}
                                    />
                                </div>
                            </PermissionGuard>
                        )}
                        <PipelineEditorToggle form={form} issues={validation.issues} />
                        <PipelineWebhookInfo definition={() => form.getValues('definition') as PipelineDefinition | undefined} />
                    </PageBlock>
                    <PermissionGuard requires={[DATAHUB_PERMISSIONS.VIEW_RUNS]}>
                        <div id="runs">
                            <PipelineRunsBlock pipelineId={entity?.id} />
                        </div>
                    </PermissionGuard>
                </PageLayout>
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
                pipelineId={entity?.id}
                definition={form.getValues('definition') as PipelineDefinition | undefined}
            />

            <VersionHistoryDialog
                open={historyOpen}
                onOpenChange={setHistoryOpen}
                pipelineId={entity?.id}
            />
        </>
    );
}
