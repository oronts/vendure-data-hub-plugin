import {
    Badge,
    Button,
    DashboardRouteDefinition,
    DetailFormGrid,
    FormFieldWrapper,
    Input,
    Switch,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    PageLayout,
    PageTitle,
    PermissionGuard,
    detailPageRouteLoader,
    useDetailPage,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Textarea,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogClose,
} from '@vendure/dashboard';
import { AnyRoute, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { graphql } from '@/gql';
import { DATAHUB_ROUTE_BASE, getStatusBadgeVariant } from '../../constants/index';
import { PipelineRunsBlock } from './pipeline-runs';
import { api } from '@vendure/dashboard';
import * as React from 'react';
import { PipelineExportDialog } from '../../components/pipelines/pipeline-export';
import { PipelineImportDialog } from '../../components/pipelines/pipeline-import';
import { PipelineEditor } from '../../components/pipelines/pipeline-editor';
import { ReactFlowPipelineEditor } from '../../components/pipelines/reactflow-pipeline-editor';
import { validateCode, validateRequired, CODE_PATTERN } from '../../utils/form-validation';
import { FieldError, FormErrorSummary } from '../../components/common/validation-feedback';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/** Pipeline status values */
type PipelineStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED';

/** Extended pipeline entity with status fields from GraphQL */
interface PipelineEntity {
    id: string;
    code: string;
    name: string;
    enabled: boolean;
    status?: PipelineStatus;
    version?: number;
    publishedAt?: string;
    definition?: Record<string, unknown>;
}

/** Validation result from the API */
interface ValidationResult {
    isValid: boolean;
    errors?: string[];
    issues?: ValidationIssue[];
    warnings?: ValidationIssue[];
    level?: string;
}

/** Validation issue structure */
interface ValidationIssue {
    message: string;
    stepKey?: string | null;
    reason?: string | null;
    field?: string | null;
}

/** Dry run result structure */
interface DryRunResult {
    metrics: unknown;
    notes: string[];
    sampleRecords?: Array<{
        before: Record<string, unknown>;
        after: Record<string, unknown>;
        step: string;
    }>;
}

/** Pipeline step configuration */
interface PipelineStepConfig {
    type?: string;
    requireIdempotencyKey?: boolean;
    signature?: string;
    headerName?: string;
    [key: string]: unknown;
}

/** Pipeline step in definition */
interface PipelineStep {
    type: string;
    config?: PipelineStepConfig;
    [key: string]: unknown;
}

/** Pipeline definition structure */
interface PipelineDefinition {
    code?: string;
    steps?: PipelineStep[];
    [key: string]: unknown;
}

const pipelineDetailDocument = graphql(`
    query GetDataHubPipeline($id: ID!) {
        dataHubPipeline(id: $id) {
            id
            createdAt
            updatedAt
            code
            name
            enabled
            status
            version
            publishedAt
            definition
        }
    }
`);

const createPipelineDocument = graphql(`
    mutation CreateDataHubPipeline($input: CreateDataHubPipelineInput!) {
        createDataHubPipeline(input: $input) { id }
    }
`);

const updatePipelineDocument = graphql(`
    mutation UpdateDataHubPipeline($input: UpdateDataHubPipelineInput!) {
        updateDataHubPipeline(input: $input) { id }
    }
`);

const dryRunDocument = graphql(`
    mutation DryRunDataHubPipeline($pipelineId: ID!) {
        startDataHubPipelineDryRun(pipelineId: $pipelineId) {
            metrics
            notes
            sampleRecords { step before after }
        }
    }
`);

const startRunDocument = graphql(`
    mutation StartDataHubPipelineRun($pipelineId: ID!) {
        startDataHubPipelineRun(pipelineId: $pipelineId) {
            id
            status
        }
    }
`);

const validateDocument = graphql(`
    mutation ValidatePipeline($definition: JSON!, $level: String) {
        validateDataHubPipelineDefinition(definition: $definition, level: $level) {
            isValid
            errors
            issues {
                message
                stepKey
                reason
                field
            }
            warnings {
                message
                stepKey
                reason
                field
            }
            level
        }
    }
`);

const timelineDocument = graphql(`
    query DataHubPipelineTimeline($pipelineId: ID!, $limit: Int) {
        dataHubPipelineTimeline(pipelineId: $pipelineId, limit: $limit) {
            revision {
                id
                createdAt
                version
                type
                commitMessage
                authorName
                changesSummary
                isLatest
                isCurrent
            }
            runCount
            lastRunAt
            lastRunStatus
        }
    }
`);

export const pipelineDetail: DashboardRouteDefinition = {
    path: `${DATAHUB_ROUTE_BASE}/$id`,
    loader: detailPageRouteLoader({
        queryDocument: pipelineDetailDocument,
        breadcrumb: (isNew, entity) => [
            { path: DATAHUB_ROUTE_BASE, label: 'Data Hub' },
            isNew ? 'New pipeline' : entity?.name,
        ],
    }),
    component: route => (
        <PermissionGuard requires={['ReadDataHubPipeline']}>
            <PipelineDetailPage route={route} />
        </PermissionGuard>
    ),
};

function PipelineDetailPage({ route }: { route: AnyRoute }) {
    const params = route.useParams();
    const navigate = useNavigate();
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
            toast('Successfully saved pipeline');
            resetForm();
            if (creating) {
                await navigate({ to: `../$id`, params: { id: data.id } });
            }
        },
        onError: err => {
            toast('Failed to save pipeline', {
                description: err instanceof Error ? err.message : 'Unknown error',
            });
        },
    });

    const [dryRunOpen, setDryRunOpen] = React.useState(false);
    const [dryRunResult, setDryRunResult] = React.useState<DryRunResult | null>(null);
    const [dryRunPending, setDryRunPending] = React.useState(false);
    const [dryRunTab, setDryRunTab] = React.useState<'summary' | 'diff' | 'simulation'>('summary');
    const [historyOpen, setHistoryOpen] = React.useState(false);
    const [historyPending, setHistoryPending] = React.useState(false);
    const [timeline, setTimeline] = React.useState<Array<{
        revision: {
            id: string;
            createdAt: string;
            version: number;
            type: string;
            commitMessage?: string | null;
            authorName?: string | null;
            changesSummary?: unknown;
            isLatest: boolean;
            isCurrent: boolean;
        };
        runCount: number;
        lastRunAt?: string | null;
        lastRunStatus?: string | null;
    }>>([]);

    // Live validation - always triggered on definition changes
    // Blocks save when invalid (not just publish)
    const [validation, setValidation] = React.useState<{
        isValid: boolean | null;
        count: number;
        issues: ValidationIssue[];
        warnings: ValidationIssue[];
    }>({ isValid: null, count: 0, issues: [], warnings: [] });
    const [validationPending, setValidationPending] = React.useState(false);
    const [issuesOpen, setIssuesOpen] = React.useState(false);

    // Watch the definition for changes - this ensures validation runs on every edit
    const watchedDefinition = form.watch('definition');

    React.useEffect(() => {
        const def = watchedDefinition;
        if (!def) {
            setValidation({ isValid: null, count: 0, issues: [], warnings: [] });
            return;
        }

        // Validate immediately on load and debounce subsequent changes
        let cancelled = false;
        const timer = setTimeout(async () => {
            setValidationPending(true);
            try {
                const res = await api.mutate(validateDocument, { definition: def, level: 'full' });
                if (cancelled) return;
                const out = res?.validateDataHubPipelineDefinition as ValidationResult | undefined;
                const issues: ValidationIssue[] = Array.isArray(out?.issues)
                    ? out.issues.map((i) => ({
                          message: i.message,
                          stepKey: i.stepKey ?? null,
                          reason: i.reason ?? null,
                          field: i.field ?? null,
                      }))
                    : (Array.isArray(out?.errors) ? out.errors : []).map((m) => ({ message: String(m) }));
                const warnings: ValidationIssue[] = Array.isArray(out?.warnings)
                    ? out.warnings.map((i) => ({
                          message: i.message,
                          stepKey: i.stepKey ?? null,
                          reason: i.reason ?? null,
                          field: i.field ?? null,
                      }))
                    : [];
                setValidation({ isValid: Boolean(out?.isValid), count: issues.length, issues, warnings });
            } catch (e) {
                if (!cancelled) {
                    setValidation({
                        isValid: false,
                        count: 1,
                        issues: [{ message: e instanceof Error ? e.message : 'Validation failed' }],
                        warnings: [],
                    });
                }
            } finally {
                if (!cancelled) setValidationPending(false);
            }
        }, 300); // Reduced debounce for faster feedback

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [watchedDefinition]);

    async function handleDryRun() {
        if (!entity?.id) return;
        setDryRunOpen(true);
        setDryRunPending(true);
        try {
            const res = await api.mutate(dryRunDocument, { pipelineId: entity.id });
            const result = res?.startDataHubPipelineDryRun;
            if (result) {
                setDryRunResult({
                    metrics: result.metrics,
                    notes: result.notes ?? [],
                    sampleRecords: result.sampleRecords ?? undefined,
                });
            } else {
                setDryRunResult(null);
            }
        } catch (err) {
            toast('Dry run failed', { description: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
            setDryRunPending(false);
        }
    }

    React.useEffect(() => {
        if (typeof window !== 'undefined' && window.location.hash === '#runs') {
            const el = document.getElementById('runs');
            if (el) {
                try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { el.scrollIntoView(); }
            }
        }
    }, []);
    return (
        <>
        <Page pageId="data-hub-pipeline-detail" form={form} submitHandler={submitHandler}>
            <PageTitle>{creating ? 'New pipeline' : entity?.name ?? ''}</PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    <PermissionGuard requires={['UpdateDataHubPipeline']}>
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
                    {!creating && (
                        <PipelineImportDialog onImport={def => form.setValue('definition', def, { shouldDirty: true })} />
                    )}
                    {!creating && <PipelineExportDialog definition={entity?.definition} />}
                    {!creating && (
                        <PermissionGuard requires={['RunDataHubPipeline']}>
                            <Button
                                variant="outline"
                                onClick={async () => {
                                    if (!entity?.id) return;
                                    try {
                                        await api.mutate(startRunDocument, { pipelineId: entity.id });
                                        toast('Run started');
                                    } catch (err) {
                                        toast('Failed to start run', {
                                            description: err instanceof Error ? err.message : 'Unknown error',
                                        });
                                    }
                                }}
                            >
                                Start run
                            </Button>
                        </PermissionGuard>
                    )}
                    {!creating && ((entity as PipelineEntity | undefined)?.status === 'DRAFT') && (
                        <PermissionGuard requires={['DataHubPipeline:Update']}>
                            <Button
                                variant="outline"
                                onClick={async () => {
                                    if (!entity?.id) return;
                                    try {
                                        await api.mutate(graphql(`mutation SubmitForReview($id: ID!) { submitDataHubPipelineForReview(id: $id) { id status } }`), { id: entity.id });
                                        toast('Submitted for review');
                                    } catch (err) {
                                        toast('Submit failed', { description: err instanceof Error ? err.message : 'Unknown error' });
                                    }
                                }}
                            >
                                Submit for review
                            </Button>
                        </PermissionGuard>
                    )}
                    {!creating && ((entity as PipelineEntity | undefined)?.status === 'REVIEW') && (
                        <PermissionGuard requires={['ReviewDataHubPipeline']}>
                            <Button
                                variant="outline"
                                onClick={async () => {
                                    if (!entity?.id) return;
                                    try {
                                        await api.mutate(graphql(`mutation Approve($id: ID!) { approveDataHubPipeline(id: $id) { id status } }`), { id: entity.id });
                                        toast('Approved');
                                    } catch (err) { toast('Approve failed', { description: err instanceof Error ? err.message : 'Unknown error' }); }
                                }}
                            >
                                Approve
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={async () => {
                                    if (!entity?.id) return;
                                    try {
                                        await api.mutate(graphql(`mutation Reject($id: ID!) { rejectDataHubPipelineReview(id: $id) { id status } }`), { id: entity.id });
                                        toast('Rejected');
                                    } catch (err) { toast('Reject failed', { description: err instanceof Error ? err.message : 'Unknown error' }); }
                                }}
                            >
                                Reject
                            </Button>
                        </PermissionGuard>
                    )}
                    {!creating && (
                        <PermissionGuard requires={['PublishDataHubPipeline']}>
                            <Button
                                variant="secondary"
                                onClick={async () => {
                                    if (!entity?.id) return;
                                    try {
                                        // Re-validate before publishing
                                        const def = form.getValues('definition');
                                        const res = await api.mutate(validateDocument, { definition: def });
                                        const out = res?.validateDataHubPipelineDefinition as ValidationResult | undefined;
                                        const isValid = Boolean(out?.isValid);
                                        const issuesArr: ValidationIssue[] = Array.isArray(out?.issues)
                                            ? out.issues.map((i) => ({
                                                  message: i.message,
                                                  stepKey: i.stepKey ?? null,
                                                  reason: i.reason ?? null,
                                                  field: i.field ?? null,
                                              }))
                                            : (Array.isArray(out?.errors) ? out.errors : []).map((m) => ({ message: String(m) }));
                                        if (!isValid) {
                                            setValidation({ isValid: false, count: issuesArr.length, issues: issuesArr, warnings: [] });
                                            setIssuesOpen(true);
                                            toast('Fix validation issues before publishing');
                                            return;
                                        }
                                        await api.mutate(graphql(`mutation PublishPipeline($id: ID!) { publishDataHubPipeline(id: $id) { id status publishedAt } }`), { id: entity.id });
                                        toast('Published');
                                    } catch (err) {
                                        toast('Publish failed', { description: err instanceof Error ? err.message : 'Unknown error' });
                                    }
                                }}
                            >
                                Publish
                            </Button>
                        </PermissionGuard>
                    )}
                    {!creating && (
                        <PermissionGuard requires={['RunDataHubPipeline']}>
                            <Button variant="secondary" onClick={handleDryRun}>
                                Dry run
                            </Button>
                        </PermissionGuard>
                    )}
                    {!creating && (
                        <Button variant="ghost" onClick={async () => {
                            if (!entity?.id) return;
                            setHistoryOpen(true);
                            setHistoryPending(true);
                            try {
                                const res = await api.query(timelineDocument, { pipelineId: entity.id, limit: 20 });
                                setTimeline((res?.dataHubPipelineTimeline ?? []) as typeof timeline);
                            } catch (err) {
                                toast('Failed to load version history', { description: err instanceof Error ? err.message : 'Unknown error' });
                            } finally {
                                setHistoryPending(false);
                            }
                        }}>Version history</Button>
                    )}
                </PageActionBarRight>
            </PageActionBar>
            <PageLayout>
                <PageBlock column="main" blockId="main-form">
                    <DetailFormGrid>
                        <FormFieldWrapper
                            name="name"
                            label="Name"
                            control={form.control}
                            rules={{
                                required: 'Name is required',
                                minLength: { value: 2, message: 'Name must be at least 2 characters' },
                            }}
                            render={({ field, fieldState }) => (
                                <div>
                                    <Input
                                        {...field}
                                        placeholder="My Pipeline"
                                        className={fieldState.error ? 'border-destructive focus-visible:ring-destructive' : ''}
                                    />
                                    <FieldError error={fieldState.error?.message} touched={fieldState.isTouched} />
                                </div>
                            )}
                        />
                        <FormFieldWrapper
                            name="code"
                            label="Code"
                            control={form.control}
                            rules={{
                                required: 'Code is required',
                                pattern: {
                                    value: CODE_PATTERN,
                                    message: 'Must start with a letter and contain only letters, numbers, hyphens, and underscores',
                                },
                            }}
                            render={({ field, fieldState }) => (
                                <div>
                                    <Input
                                        {...field}
                                        placeholder="my-pipeline-code"
                                        className={fieldState.error ? 'border-destructive focus-visible:ring-destructive' : ''}
                                    />
                                    <FieldError error={fieldState.error?.message} touched={fieldState.isTouched} />
                                    {!fieldState.error && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Letters, numbers, hyphens, and underscores only
                                        </p>
                                    )}
                                </div>
                            )}
                        />
                        <FormFieldWrapper name="enabled" label="Enabled" control={form.control} render={({ field }) => (
                            <div className="flex items-center h-10"><Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} /></div>
                        )} />
                        {!creating && (
                            <>
                                <div className="col-span-2 text-sm flex items-center gap-2">
                                    Status:{' '}
                                    <Badge variant={getStatusBadgeVariant((entity as PipelineEntity | undefined)?.status ?? 'DRAFT')}>
                                        {(entity as PipelineEntity | undefined)?.status ?? 'DRAFT'}
                                    </Badge>
                                    <span className="text-muted-foreground">v{(entity as PipelineEntity | undefined)?.version ?? 0}</span>
                                </div>
                                <div className="col-span-2 text-sm flex items-center gap-3">
                                    <span>Published: {(entity as PipelineEntity | undefined)?.publishedAt ? new Date((entity as PipelineEntity).publishedAt!).toLocaleString() : '—'}</span>
                                    {validationPending ? (
                                        <span className="text-xs text-muted-foreground">Validating…</span>
                                    ) : validation.isValid === true ? (
                                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Valid</span>
                                    ) : validation.isValid === false ? (
                                        <button type="button" className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 hover:underline" onClick={() => setIssuesOpen(true)}>
                                            Issues: {validation.count}
                                        </button>
                                    ) : null}
                                </div>
                            </>
                        )}
                    </DetailFormGrid>
                    {/* Pipeline Editor with mode toggle */}
                    <PipelineEditorWithModeToggle form={form} issues={validation.issues} />

                    {/* Webhook Info (only shown for webhook triggers) */}
                    <WebhookInfo definition={() => form.getValues('definition') as PipelineDefinition | undefined} />
                </PageBlock>
                <PermissionGuard requires={['ViewDataHubRuns']}>
                    <div id="runs">
                        <PipelineRunsBlock pipelineId={entity?.id} />
                    </div>
                </PermissionGuard>
            </PageLayout>
        </Page>
        {/* Validation Issues Dialog */}
        <Dialog open={issuesOpen} onOpenChange={setIssuesOpen}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Validation Issues</DialogTitle>
                    <DialogDescription>Fix the following before publishing.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 max-h-[60vh] overflow-auto">
                    {validation.issues.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No issues.</div>
                    ) : (
                        validation.issues.map((issue, i) => (
                            <div key={i} className="border rounded p-2">
                                <div className="text-sm">{issue.message}</div>
                                <div className="text-xs text-muted-foreground">
                                    {issue.stepKey ? `Step: ${issue.stepKey}` : ''}
                                    {issue.field ? ` · Field: ${issue.field}` : ''}
                                    {issue.reason ? ` · Code: ${issue.reason}` : ''}
                                </div>
                            </div>
                        ))
                    )}
                </div>
                <div className="flex justify-end">
                    <DialogClose asChild>
                        <Button variant="outline">Close</Button>
                    </DialogClose>
                </div>
            </DialogContent>
        </Dialog>
        <Dialog open={dryRunOpen} onOpenChange={setDryRunOpen}>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>Dry Run</DialogTitle>
                    <DialogDescription>
                        {dryRunPending ? 'Running dry run…' : 'Preview pipeline execution without making changes'}
                    </DialogDescription>
                </DialogHeader>
                <Tabs value={dryRunTab} onValueChange={v => setDryRunTab(v as typeof dryRunTab)} className="flex-1 overflow-hidden flex flex-col">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="summary">Summary</TabsTrigger>
                        <TabsTrigger value="diff">Record Diff</TabsTrigger>
                        <TabsTrigger value="simulation">Simulate</TabsTrigger>
                    </TabsList>
                    <div className="flex-1 overflow-auto mt-4">
                        <TabsContent value="summary" className="mt-0">
                            {dryRunPending ? (
                                <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                                    <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                                    <span>Running dry run…</span>
                                </div>
                            ) : dryRunResult ? (
                                <div className="space-y-4">
                                    <DryRunMetricsSummary metrics={dryRunResult.metrics} />
                                    <DryRunStepDetails metrics={dryRunResult.metrics} />
                                    {dryRunResult.notes?.length ? (
                                        <div className="space-y-2">
                                            {/* Show errors first in red */}
                                            {dryRunResult.notes.filter(n => n.startsWith('Error:')).length > 0 && (
                                                <div className="border rounded-md p-3 bg-red-50 border-red-200">
                                                    <div className="text-sm font-medium text-red-800 mb-1">Errors</div>
                                                    <ul className="list-disc pl-5 text-sm text-red-700">
                                                        {dryRunResult.notes.filter(n => n.startsWith('Error:')).map((n, i) => (
                                                            <li key={i}>{n.replace('Error: ', '')}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {/* Show regular notes in amber */}
                                            {dryRunResult.notes.filter(n => !n.startsWith('Error:')).length > 0 && (
                                                <div className="border rounded-md p-3 bg-amber-50 border-amber-200">
                                                    <div className="text-sm font-medium text-amber-800 mb-1">Notes</div>
                                                    <ul className="list-disc pl-5 text-sm text-amber-700">
                                                        {dryRunResult.notes.filter(n => !n.startsWith('Error:')).map((n, i) => (
                                                            <li key={i}>{n}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="text-muted-foreground py-8 text-center">
                                    No results yet. Click "Run dry run" below to execute.
                                </div>
                            )}
                        </TabsContent>
                        <TabsContent value="diff" className="mt-0">
                            {dryRunResult?.sampleRecords?.length ? (
                                <div className="space-y-4">
                                    {dryRunResult.sampleRecords.map((rec, i) => (
                                        <RecordDiffView key={i} before={rec.before} after={rec.after} step={rec.step} />
                                    ))}
                                </div>
                            ) : (
                                <div className="text-muted-foreground py-8 text-center">
                                    <div className="mb-2">No record diffs available.</div>
                                    <div className="text-xs">Run with sample data in the Simulate tab to see transformations.</div>
                                </div>
                            )}
                        </TabsContent>
                        <TabsContent value="simulation" className="mt-0">
                            <div className="space-y-4">
                                <div className="border rounded-md p-4 bg-muted/30">
                                    <div className="text-sm font-medium mb-2">How Dry Run Works</div>
                                    <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                                        <li>Extracts real data from your configured source</li>
                                        <li>Runs all transform operations on the data</li>
                                        <li>Simulates loader operations without writing to database</li>
                                        <li>Shows before/after samples in the "Record Diff" tab</li>
                                    </ul>
                                </div>
                                <div>
                                    <div className="text-sm font-medium mb-2">Test Individual Steps</div>
                                    <div className="text-sm text-muted-foreground mb-3">
                                        Use the Step Tester in the pipeline editor to test individual extract, transform, or load steps with custom sample data.
                                    </div>
                                </div>
                                <Button
                                    onClick={() => {
                                        handleDryRun();
                                        setDryRunTab('diff');
                                    }}
                                    disabled={dryRunPending}
                                >
                                    {dryRunPending ? 'Running…' : 'Run Dry Run & View Diff'}
                                </Button>
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>
                <div className="flex items-center justify-between pt-4 border-t">
                    <div className="text-xs text-muted-foreground">
                        Dry run does not persist any changes to the database
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => setDryRunOpen(false)}>Close</Button>
                        <Button onClick={handleDryRun} disabled={dryRunPending}>
                            {dryRunPending ? 'Running…' : 'Run Dry Run'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader className="flex-none">
                    <DialogTitle>Version history</DialogTitle>
                    <DialogDescription>Timeline of pipeline revisions</DialogDescription>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-auto">
                    {historyPending ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">Loading…</div>
                    ) : timeline.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">No version history</div>
                    ) : (
                        <div className="space-y-2">
                            {timeline.map((entry, idx) => (
                                <div
                                    key={entry.revision.id}
                                    className={`border rounded-md p-3 ${entry.revision.isCurrent ? 'border-primary bg-primary/5' : ''}`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">
                                                {entry.revision.type === 'published' ? `v${entry.revision.version}` : 'Draft'}
                                            </span>
                                            {entry.revision.isCurrent && (
                                                <Badge variant="default" className="text-xs">Current</Badge>
                                            )}
                                            {entry.revision.isLatest && !entry.revision.isCurrent && (
                                                <Badge variant="secondary" className="text-xs">Latest</Badge>
                                            )}
                                            <Badge variant={entry.revision.type === 'published' ? 'default' : 'outline'} className="text-xs">
                                                {entry.revision.type}
                                            </Badge>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(entry.revision.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                    {entry.revision.commitMessage && (
                                        <div className="text-sm text-foreground mb-1">{entry.revision.commitMessage}</div>
                                    )}
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        {entry.revision.authorName && <span>by {entry.revision.authorName}</span>}
                                        {entry.runCount > 0 && <span>{entry.runCount} run{entry.runCount !== 1 ? 's' : ''}</span>}
                                        {entry.lastRunStatus && (
                                            <span className={entry.lastRunStatus === 'success' ? 'text-green-600' : entry.lastRunStatus === 'failed' ? 'text-red-600' : ''}>
                                                Last: {entry.lastRunStatus}
                                            </span>
                                        )}
                                    </div>
                                    {entry.revision.changesSummary && typeof entry.revision.changesSummary === 'object' && (
                                        <div className="mt-2 text-xs text-muted-foreground">
                                            {(() => {
                                                const cs = entry.revision.changesSummary as { stepsAdded?: string[]; stepsRemoved?: string[]; stepsModified?: string[]; totalChanges?: number };
                                                const parts: string[] = [];
                                                if (cs.stepsAdded?.length) parts.push(`+${cs.stepsAdded.length} step${cs.stepsAdded.length > 1 ? 's' : ''}`);
                                                if (cs.stepsRemoved?.length) parts.push(`-${cs.stepsRemoved.length} step${cs.stepsRemoved.length > 1 ? 's' : ''}`);
                                                if (cs.stepsModified?.length) parts.push(`~${cs.stepsModified.length} modified`);
                                                return parts.length ? parts.join(', ') : `${cs.totalChanges ?? 0} changes`;
                                            })()}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-2 pt-3 flex-none">
                    <DialogClose asChild>
                        <Button variant="secondary">Close</Button>
                    </DialogClose>
                </div>
            </DialogContent>
        </Dialog>
        </>
    );
}

// HELPER COMPONENTS

function WebhookInfo({ definition }: Readonly<{ definition: () => PipelineDefinition | undefined }>) {
    const def = definition() ?? {};
    const trigger = (def.steps ?? [])[0] as PipelineStep | undefined;
    if (!trigger || trigger.type !== 'TRIGGER') return null;
    const cfg = trigger.config ?? {};
    if (cfg.type !== 'webhook') return null;
    const url = `${window.location.origin}/data-hub/webhook/${def.code ?? 'PIPELINE_CODE'}`;
    const requiresIdk = Boolean(cfg.requireIdempotencyKey);
    const sig = cfg.signature === 'hmac-sha256';
    const headerName = cfg.headerName ?? 'x-datahub-signature';
    const curl = [
        `curl -X POST '${url}' \\\n+ -H 'Content-Type: application/json'${requiresIdk ? " \\\n+ -H 'X-Idempotency-Key: <unique-id>'" : ''}${sig ? ` \\\n+ -H '${headerName}: <hmac-of-body>'` : ''} \\\n+ -d '{"records":[{"id":"123","name":"Example"}]}'`,
    ].join('');
    return (
        <div className="border rounded-md p-3 space-y-2">
            <div className="text-sm font-medium">Webhook Trigger</div>
            <div className="text-sm">POST <code className="font-mono">/data-hub/webhook/{def.code ?? 'PIPELINE_CODE'}</code></div>
            {requiresIdk && <div className="text-sm">Requires header <code className="font-mono">X-Idempotency-Key</code></div>}
            {sig && <div className="text-sm">Signed with HMAC-SHA256, header <code className="font-mono">{headerName}</code></div>}
            <div>
                <div className="text-sm font-medium mb-1">Example cURL</div>
                <pre className="bg-muted p-2 rounded text-xs overflow-auto">{curl}</pre>
            </div>
        </div>
    );
}


// DRY-RUN HELPER COMPONENTS

interface DryRunMetrics {
    recordsProcessed?: number;
    recordsSucceeded?: number;
    recordsFailed?: number;
    recordsSkipped?: number;
    durationMs?: number;
    stepsExecuted?: number;
    details?: Array<{
        stepKey: string;
        adapterCode?: string;
        recordsIn?: number;
        recordsOut?: number;
        durationMs?: number;
    }>;
}

function DryRunMetricsSummary({ metrics }: Readonly<{ metrics: unknown }>) {
    const m = (metrics ?? {}) as DryRunMetrics;
    const cards = [
        { label: 'Processed', value: m.recordsProcessed ?? 0, color: 'text-blue-600' },
        { label: 'Succeeded', value: m.recordsSucceeded ?? 0, color: 'text-green-600' },
        { label: 'Failed', value: m.recordsFailed ?? 0, color: 'text-red-600' },
        { label: 'Skipped', value: m.recordsSkipped ?? 0, color: 'text-amber-600' },
    ];

    return (
        <div className="grid grid-cols-4 gap-4">
            {cards.map(card => (
                <div key={card.label} className="border rounded-md p-3 text-center">
                    <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                    <div className="text-xs text-muted-foreground">{card.label}</div>
                </div>
            ))}
        </div>
    );
}

function DryRunStepDetails({ metrics }: Readonly<{ metrics: unknown }>) {
    const m = (metrics ?? {}) as DryRunMetrics;
    const details = m.details ?? [];

    if (details.length === 0) {
        return null;
    }

    return (
        <div className="border rounded-md overflow-hidden">
            <div className="bg-muted px-3 py-2 text-sm font-medium">Step Execution Details</div>
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b bg-muted/50">
                        <th className="text-left px-3 py-2">Step</th>
                        <th className="text-left px-3 py-2">Adapter</th>
                        <th className="text-right px-3 py-2">In</th>
                        <th className="text-right px-3 py-2">Out</th>
                        <th className="text-right px-3 py-2">Duration</th>
                    </tr>
                </thead>
                <tbody>
                    {details.map((d, i) => (
                        <tr key={i} className="border-b last:border-b-0 hover:bg-muted/30">
                            <td className="px-3 py-2 font-mono text-xs">{d.stepKey}</td>
                            <td className="px-3 py-2 text-muted-foreground">{d.adapterCode ?? '—'}</td>
                            <td className="px-3 py-2 text-right">{d.recordsIn ?? 0}</td>
                            <td className="px-3 py-2 text-right">{d.recordsOut ?? 0}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                                {d.durationMs != null ? `${d.durationMs}ms` : '—'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function RecordDiffView({ before, after, step }: Readonly<{
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    step: string;
}>) {
    const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    const changes: Array<{ key: string; type: 'added' | 'removed' | 'changed' | 'unchanged'; oldValue?: unknown; newValue?: unknown }> = [];

    for (const key of allKeys) {
        const hasOld = Object.prototype.hasOwnProperty.call(before, key);
        const hasNew = Object.prototype.hasOwnProperty.call(after, key);
        const oldVal = before[key];
        const newVal = after[key];

        if (!hasOld && hasNew) {
            changes.push({ key, type: 'added', newValue: newVal });
        } else if (hasOld && !hasNew) {
            changes.push({ key, type: 'removed', oldValue: oldVal });
        } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changes.push({ key, type: 'changed', oldValue: oldVal, newValue: newVal });
        } else {
            changes.push({ key, type: 'unchanged', oldValue: oldVal, newValue: newVal });
        }
    }

    const changedCount = changes.filter(c => c.type !== 'unchanged').length;

    return (
        <div className="border rounded-md overflow-hidden">
            <div className="bg-muted px-3 py-2 flex items-center justify-between">
                <span className="text-sm font-medium">Step: {step}</span>
                <span className="text-xs text-muted-foreground">
                    {changedCount} change{changedCount !== 1 ? 's' : ''}
                </span>
            </div>
            <div className="divide-y divide-border max-h-[300px] overflow-auto bg-card">
                {changes.map(c => (
                    <div
                        key={c.key}
                        className={`px-3 py-2 text-sm grid grid-cols-3 gap-2 ${
                            c.type === 'added' ? 'bg-green-500/10 dark:bg-green-500/20' :
                            c.type === 'removed' ? 'bg-red-500/10 dark:bg-red-500/20' :
                            c.type === 'changed' ? 'bg-amber-500/10 dark:bg-amber-500/20' : 'bg-card'
                        }`}
                    >
                        <div className="font-mono text-xs flex items-center gap-2 text-foreground">
                            {c.type === 'added' && <span className="text-green-600 dark:text-green-400">+</span>}
                            {c.type === 'removed' && <span className="text-red-600 dark:text-red-400">−</span>}
                            {c.type === 'changed' && <span className="text-amber-600 dark:text-amber-400">~</span>}
                            {c.type === 'unchanged' && <span className="text-muted-foreground">=</span>}
                            <span>{c.key}</span>
                        </div>
                        <div className="text-muted-foreground truncate" title={JSON.stringify(c.oldValue)}>
                            {c.type !== 'added' ? formatValue(c.oldValue) : '—'}
                        </div>
                        <div className={`truncate text-foreground ${c.type === 'changed' || c.type === 'added' ? 'font-medium' : ''}`} title={JSON.stringify(c.newValue)}>
                            {c.type !== 'removed' ? formatValue(c.newValue) : '—'}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function formatValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value.length > 50 ? `${value.slice(0, 50)}…` : value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (typeof value === 'object') return `{${Object.keys(value).length} keys}`;
    return String(value);
}

// PIPELINE EDITOR WITH MODE TOGGLE

function PipelineEditorWithModeToggle({ form, issues }: { form: any; issues: Array<{ message: string; stepKey?: string | null; field?: string | null; reason?: string | null }> }) {
    const definition = form.watch('definition');

    // Convert canonical step-based definition <-> visual (nodes/edges) on demand
    const toVisual = React.useCallback((def: any) => {
        if (!def) return { nodes: [], edges: [], variables: {}, capabilities: undefined, dependsOn: undefined, trigger: undefined };
        if (def.nodes) return def; // already visual
        const steps: any[] = Array.isArray(def.steps) ? def.steps : [];

        const nodes = steps.map((step, i) => {
            const id = String(step.key ?? `step-${i}`);
            const category = mapStepTypeToCategory(step.type);
            // Use canonical adapter code directly - the adapter catalog uses canonical codes
            const adapterCode = step.config?.adapterCode;
            const label = step.name || step.key || `Step ${i + 1}`;

            return {
                id,
                type: category,
                position: { x: 120 + i * 240, y: 120 },
                data: {
                    label,
                    type: category,
                    adapterCode,
                    config: step.config ?? {},
                },
            };
        });
        // naive sequential edges if none provided
        const edges = Array.isArray(def.edges) && def.edges.length
            ? def.edges.map((e: any, idx: number) => ({ id: String(e.id ?? `edge-${idx}`), source: String(e.from), target: String(e.to) }))
            : nodes.slice(1).map((n: any, i: number) => ({ id: `edge-${i}`, source: nodes[i].id, target: n.id }));
        return {
            nodes,
            edges,
            variables: def.context ?? {},
            // Preserve these fields for round-trip
            capabilities: def.capabilities,
            dependsOn: def.dependsOn,
            trigger: def.trigger,
        };
    }, []);

    const toCanonical = React.useCallback((def: any) => {
        // Default empty definition
        if (!def) return { version: 1, steps: [] };

        // Visual format (has nodes array) - convert to canonical
        // Check nodes FIRST because the definition might have both (after visual editing)
        if (Array.isArray(def.nodes) && def.nodes.length > 0) {
            const steps = def.nodes.map((node: any, idx: number) => {
                const stepType = mapCategoryToStepType(node.data?.type);
                // Use || instead of ?? to treat empty string as falsy
                // Prioritize node.data.adapterCode, fall back to config.adapterCode
                const adapterCode = node.data?.adapterCode || node.data?.config?.adapterCode || '';
                // Build config by spreading existing config FIRST, then setting adapterCode
                // This ensures our adapterCode value takes precedence over any stale value in config
                const existingConfig = node.data?.config ?? {};
                const { adapterCode: _unused, ...restConfig } = existingConfig;
                return {
                    key: node.id ?? `step-${idx}`,
                    type: stepType,
                    name: node.data?.label,
                    config: {
                        ...restConfig,
                        adapterCode,
                    },
                };
            });
            const edges = (def.edges ?? []).map((e: any, i: number) => ({
                id: e.id ?? `edge-${i}`,
                from: e.source,
                to: e.target,
            }));
            // Preserve capabilities, dependsOn, trigger during round-trip
            return {
                version: 1,
                steps,
                edges,
                context: def.variables ?? {},
                ...(def.capabilities ? { capabilities: def.capabilities } : {}),
                ...(def.dependsOn ? { dependsOn: def.dependsOn } : {}),
                ...(def.trigger ? { trigger: def.trigger } : {}),
            };
        }

        // Already canonical (has steps array but no nodes)
        if (Array.isArray(def.steps)) {
            return {
                ...def,
                version: typeof def.version === 'number' && def.version > 0 ? def.version : 1,
            };
        }

        // Unknown format - return with defaults
        return { version: 1, steps: [], ...def };
    }, []);

    const [editorMode, setEditorMode] = React.useState<'simple' | 'visual'>('simple');

    // Memoize the visual definition to prevent re-conversion on every render
    // Only recompute when the canonical definition actually changes
    const visualDefinition = React.useMemo(() => {
        return toVisual(definition);
    }, [definition, toVisual]);

    // Memoize the onChange handler to prevent unnecessary re-renders
    const handleVisualEditorChange = React.useCallback((newDef: any) => {
        form.setValue('definition', toCanonical(newDef), { shouldDirty: true });
    }, [form, toCanonical]);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Pipeline Definition</label>
                <Tabs value={editorMode} onValueChange={v => setEditorMode(v as 'simple' | 'visual')}>
                    <TabsList className="h-8">
                        <TabsTrigger value="simple" className="text-xs px-3">Simple</TabsTrigger>
                        <TabsTrigger value="visual" className="text-xs px-3">Workflow</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="border rounded-lg overflow-hidden" style={{ height: editorMode === 'visual' ? '600px' : '500px' }}>
                {editorMode === 'visual' ? (
                    <React.Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading visual editor…</div>}>
                        <ReactFlowPipelineEditor
                            definition={visualDefinition}
                            onChange={handleVisualEditorChange}
                            issues={issues}
                        />
                    </React.Suspense>
                ) : (
                    <PipelineEditor
                        definition={definition}
                        onChange={(newDef) => form.setValue('definition', newDef, { shouldDirty: true })}
                        issues={issues}
                    />
                )}
            </div>
        </div>
    );
}

/**
 * Visual node category type - matches all backend StepType values
 */
type VisualNodeCategory = 'trigger' | 'source' | 'transform' | 'validate' | 'condition' | 'load' | 'feed' | 'export' | 'sink' | 'enrich';

/**
 * Backend StepType strings - must match StepType enum in backend
 */
type StepTypeString = 'TRIGGER' | 'EXTRACT' | 'TRANSFORM' | 'VALIDATE' | 'ENRICH' | 'ROUTE' | 'LOAD' | 'EXPORT' | 'FEED' | 'SINK';

/**
 * Lookup map from StepType to visual category
 * Provides extensibility - add new step types here without modifying control flow
 * Maps each backend StepType to its corresponding visual category (1:1 mapping)
 */
const STEP_TYPE_TO_CATEGORY: Record<string, VisualNodeCategory> = {
    TRIGGER: 'trigger',
    EXTRACT: 'source',
    TRANSFORM: 'transform',
    VALIDATE: 'validate',
    ENRICH: 'enrich',
    ROUTE: 'condition',
    LOAD: 'load',
    EXPORT: 'export',
    FEED: 'feed',
    SINK: 'sink',
};

/**
 * Lookup map from category to StepType string
 * Provides extensibility - add new categories here without modifying control flow
 * Bidirectional mapping for round-trip conversion
 */
const CATEGORY_TO_STEP_TYPE: Record<string, StepTypeString> = {
    trigger: 'TRIGGER',
    source: 'EXTRACT',
    transform: 'TRANSFORM',
    validate: 'VALIDATE',
    enrich: 'ENRICH',
    condition: 'ROUTE',
    load: 'LOAD',
    export: 'EXPORT',
    feed: 'FEED',
    sink: 'SINK',
    // Legacy/alias mappings for backward compatibility
    filter: 'TRANSFORM',
};

function mapStepTypeToCategory(stepType: any): VisualNodeCategory {
    const type = String(stepType).toUpperCase();
    return STEP_TYPE_TO_CATEGORY[type] ?? 'transform';
}

function mapCategoryToStepType(category: string): StepTypeString {
    return CATEGORY_TO_STEP_TYPE[category] ?? 'TRANSFORM';
}
