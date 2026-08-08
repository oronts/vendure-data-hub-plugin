import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    DashboardRouteDefinition,
    Json,
    Label,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    PageLayout,
    PageTitle,
    PermissionGuard,
    usePermissions,
} from '@vendure/dashboard';
import { AlertCircle, Info, RefreshCw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '../../../shared';
import { ErrorState, LoadingState, PipelineSelector } from '../../components/shared';
import {
    DATAHUB_NAV_LABELS,
    DATAHUB_NAV_SECTION,
    DATAHUB_PERMISSIONS,
    FALLBACK_STAGE_CATEGORIES,
    ROUTES,
    UI_DEFAULTS,
} from '../../constants';
import {
    useConfigOptions,
    useEvents,
    usePipeline,
    usePipelineHooks,
    useTestHook,
} from '../../hooks';
import type { PipelineDefinition } from '../../types';
import { hasAllPermissions } from '../../utils/permissions';
import { getPipelineExecutionPermissions } from '../../utils/pipeline-permissions';
import { HookEventsTable } from './HookEventsTable';
import { HookStageSection } from './HookStageSection';
import { buildHookStages } from './hook-stages';
import type { HookStage } from './hook-stages';

export const hooksPage: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-hooks',
        url: ROUTES.HOOKS,
        title: DATAHUB_NAV_LABELS.HOOKS,
        requiresPermission: DATAHUB_PERMISSIONS.READ_PIPELINE,
    },
    path: ROUTES.HOOKS,
    loader: () => ({ breadcrumb: DATAHUB_NAV_LABELS.HOOKS }),
    component: () => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.READ_PIPELINE]}>
            <HooksPage />
        </PermissionGuard>
    ),
};

function HooksPage() {
    const { t } = useLingui();
    const { hasPermissions } = usePermissions();
    const [pipelineId, setPipelineId] = React.useState('');
    const [selectedStage, setSelectedStage] = React.useState<HookStage | null>(null);
    const [testResult, setTestResult] = React.useState<'success' | 'error' | null>(null);
    const [testSummary, setTestSummary] = React.useState<string | null>(null);

    const configOptionsQuery = useConfigOptions();
    const selectedPipelineQuery = usePipeline(pipelineId || undefined);
    const hooksQuery = usePipelineHooks(pipelineId || undefined);
    const eventsQuery = useEvents(UI_DEFAULTS.EVENTS_LIMIT);
    const testMutation = useTestHook();

    const stages = React.useMemo(
        () => buildHookStages(configOptionsQuery.data?.hookStages ?? []),
        [configOptionsQuery.data?.hookStages],
    );
    const stageCategories = React.useMemo(() => {
        const backendCategories = configOptionsQuery.data?.hookStageCategories ?? [];
        if (backendCategories.length > 0) return backendCategories;
        return FALLBACK_STAGE_CATEGORIES.map(category => {
            if (category.key === 'lifecycle') {
                return {
                    ...category,
                    label: t`Lifecycle`,
                    description: t`Track pipeline start, completion, and failure`,
                };
            }
            if (category.key === 'data') {
                return {
                    ...category,
                    label: t`Data processing`,
                    description: t`Intercept data at each processing step`,
                };
            }
            if (category.key === 'error') {
                return {
                    ...category,
                    label: t`Error handling`,
                    description: t`Handle errors and retries`,
                };
            }
            return category;
        });
    }, [configOptionsQuery.data?.hookStageCategories, t]);

    const hooks = hooksQuery.data ?? {};
    const selectedPipeline = selectedPipelineQuery.data;
    const executionPermissions = getPipelineExecutionPermissions(
        selectedPipeline?.definition as PipelineDefinition | undefined,
        DATAHUB_PERMISSIONS.RUN_PIPELINE,
    );
    const canTestHooks = pipelineId !== ''
        && selectedPipelineQuery.isSuccess
        && selectedPipeline != null
        && hasAllPermissions(
            executionPermissions,
            permission => hasPermissions([permission]),
        );
    const hookDataLoading = configOptionsQuery.isLoading
        || (pipelineId !== '' && (
            selectedPipelineQuery.isLoading
            || hooksQuery.isLoading
        ));
    const hookDataError = configOptionsQuery.error
        ?? selectedPipelineQuery.error
        ?? hooksQuery.error;
    const hookDisabledReason = pipelineId === ''
        ? t`Select a pipeline to test its hooks`
        : selectedPipeline == null
            ? t`The selected pipeline is unavailable`
            : !canTestHooks
                ? t`You do not have all permissions required to test this pipeline`
                : null;

    const resetTestState = React.useCallback(() => {
        setSelectedStage(null);
        setTestResult(null);
        setTestSummary(null);
    }, []);

    const handlePipelineChange = React.useCallback((nextPipelineId: string) => {
        setPipelineId(nextPipelineId);
        resetTestState();
    }, [resetTestState]);

    const refetchHookData = React.useCallback(() => {
        void configOptionsQuery.refetch();
        if (pipelineId !== '') {
            void selectedPipelineQuery.refetch();
            void hooksQuery.refetch();
        }
    }, [configOptionsQuery, hooksQuery, pipelineId, selectedPipelineQuery]);

    const runTest = React.useCallback((stage: HookStage) => {
        if (!pipelineId) {
            toast.error(t`Please select a pipeline first`);
            return;
        }
        if (!canTestHooks) {
            toast.error(t`You do not have all permissions required to test this pipeline`);
            return;
        }
        setSelectedStage(stage);
        setTestResult(null);
        setTestSummary(null);
        testMutation.mutate(
            {
                pipelineId,
                stage: stage.key,
                payload: stage.examplePayload,
            },
            {
                onSuccess: result => {
                    const summary = t`${result.executed} executed, ${result.skipped} skipped, ${result.failed} failed`;
                    setTestSummary(summary);
                    if (result.status === 'FAILED' || result.status === 'PARTIAL') {
                        setTestResult('error');
                        toast.error(t`Hook test ${result.status}: ${summary}`);
                    } else if (result.status === 'SKIPPED') {
                        setTestResult('error');
                        toast.error(t`Hook test skipped: ${summary}`);
                    } else {
                        setTestResult('success');
                        toast.success(t`Hook test completed successfully: ${summary}`);
                    }
                    void eventsQuery.refetch();
                },
                onError: error => {
                    setTestResult('error');
                    toast.error(t`Failed to test hook`, {
                        description: getErrorMessage(error),
                    });
                },
            },
        );
    }, [canTestHooks, eventsQuery, pipelineId, t, testMutation]);

    return (
        <Page pageId="data-hub-hooks">
            <PageTitle><Trans>Hooks & Events</Trans></PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    <Button
                        variant="ghost"
                        onClick={() => void eventsQuery.refetch()}
                        disabled={eventsQuery.isFetching}
                    >
                        <RefreshCw
                            className={`mr-2 h-4 w-4 ${eventsQuery.isFetching ? 'animate-spin' : ''}`}
                            aria-hidden="true"
                        />
                        <Trans>Refresh events</Trans>
                    </Button>
                </PageActionBarRight>
            </PageActionBar>

            <PageLayout>
            <PageBlock column="main" blockId="intro">
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
                            <CardTitle><Trans>Pipeline hooks</Trans></CardTitle>
                        </div>
                        <CardDescription>
                            <Trans>Observe hooks and test configured actions. Hook definitions are managed in the pipeline definition; unconfigured stages cannot be tested here.</Trans>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
                            <div className="w-full sm:max-w-xs sm:flex-1">
                                <Label
                                    htmlFor="datahub-hooks-pipeline"
                                    className="mb-1.5 block text-sm font-medium"
                                >
                                    <Trans>Select pipeline</Trans>
                                </Label>
                                <PipelineSelector
                                    id="datahub-hooks-pipeline"
                                    value={pipelineId}
                                    onValueChange={handlePipelineChange}
                                    placeholder={t`Choose a pipeline to test…`}
                                    disabled={testMutation.isPending}
                                    className="w-full"
                                    data-testid="datahub-hooks-pipeline-selector"
                                />
                            </div>
                            {selectedPipeline && (
                                <div className="min-w-0 text-sm text-muted-foreground">
                                    <Info className="mr-1 inline h-4 w-4" aria-hidden="true" />
                                    <Trans>Testing hooks for {selectedPipeline.name}</Trans>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </PageBlock>

            <PageBlock column="main" blockId="stages">
                <div className="mb-4">
                    <h2 className="mb-1 text-lg font-semibold"><Trans>Hook stages</Trans></h2>
                    <p className="text-sm text-muted-foreground">
                        <Trans>Configured stages can be tested with sample data. Results appear in recent events.</Trans>
                    </p>
                </div>
                {hookDataLoading ? (
                    <LoadingState type="card" rows={3} message={t`Loading hooks…`} />
                ) : hookDataError ? (
                    <ErrorState
                        title={t`Failed to load hook data`}
                        message={getErrorMessage(hookDataError)}
                        onRetry={refetchHookData}
                    />
                ) : stages.length === 0 ? (
                    <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                        <AlertCircle className="mx-auto mb-2 h-5 w-5" aria-hidden="true" />
                        <Trans>No hook stage metadata is available.</Trans>
                    </div>
                ) : (
                    <>
                        {testSummary && (
                            <p className="mb-4 text-sm text-muted-foreground" role="status" aria-live="polite">
                                <Trans>Last test: {testSummary}</Trans>
                            </p>
                        )}
                        {stageCategories.map(category => (
                            <HookStageSection
                                key={category.key}
                                categoryInfo={category}
                                stages={stages}
                                hooks={hooks as Record<string, unknown>}
                                selectedStage={selectedStage}
                                isPending={testMutation.isPending}
                                testResult={testResult}
                                onTest={runTest}
                                disabledReason={hookDisabledReason}
                            />
                        ))}
                    </>
                )}
            </PageBlock>

            {pipelineId && hooksQuery.isSuccess && Object.keys(hooks).length > 0 && (
                <PageBlock column="main" blockId="configured">
                    <details className="group">
                        <summary className="mb-2 flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium">
                            <span><Trans>View raw hook configuration</Trans></span>
                            <span className="text-muted-foreground">(<Trans>Advanced</Trans>)</span>
                        </summary>
                        <div className="mt-2 overflow-x-auto rounded-lg bg-muted p-3">
                            <Json value={hooks} />
                        </div>
                    </details>
                </PageBlock>
            )}

            <PageBlock column="main" blockId="events">
                {eventsQuery.isLoading ? (
                    <LoadingState type="table" rows={3} message={t`Loading recent events…`} />
                ) : eventsQuery.isError ? (
                    <ErrorState
                        title={t`Failed to load recent events`}
                        message={getErrorMessage(eventsQuery.error)}
                        onRetry={() => void eventsQuery.refetch()}
                    />
                ) : (
                    <HookEventsTable events={eventsQuery.data ?? []} />
                )}
            </PageBlock>
            </PageLayout>
        </Page>
    );
}
