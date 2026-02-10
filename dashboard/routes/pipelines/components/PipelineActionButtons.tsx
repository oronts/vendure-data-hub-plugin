import * as React from 'react';
import { api, Button, PermissionGuard } from '@vendure/dashboard';
import { toast } from 'sonner';
import {
    Play,
    Upload,
    History,
    FlaskConical,
    Rocket,
} from 'lucide-react';
import { PipelineImportDialog } from '../../../components/pipelines/PipelineImport';
import { PipelineExportDialog } from '../../../components/pipelines/PipelineExport';
import {
    DATAHUB_PERMISSIONS,
    PIPELINE_STATUS,
    TOAST_PIPELINE,
} from '../../../constants';
import type { PipelineStatus } from '../../../constants';
import {
    publishPipelineDocument,
    runPipelineDocument,
    validatePipelineDefinitionDocument,
} from '../../../hooks';
import type {
    PipelineDefinition,
    PipelineValidationResult,
    ValidationIssue,
} from '../../../types';

export interface PipelineActionButtonsProps {
    entityId?: string;
    status?: PipelineStatus;
    definition?: PipelineDefinition;
    creating: boolean;
    onImport: (def: PipelineDefinition) => void;
    onOpenDryRun: () => void;
    onOpenHistory: () => void;
    onValidationFailed: (issues: ValidationIssue[]) => void;
    onStatusChange?: () => void;
}

export function PipelineActionButtons({
    entityId,
    status,
    definition,
    creating,
    onImport,
    onOpenDryRun,
    onOpenHistory,
    onValidationFailed,
    onStatusChange,
}: Readonly<PipelineActionButtonsProps>) {
    const [isRunning, setIsRunning] = React.useState(false);
    const [isPublishing, setIsPublishing] = React.useState(false);

    const handleStartRun = React.useCallback(async () => {
        if (!entityId) return;
        setIsRunning(true);
        try {
            await api.mutate(runPipelineDocument, { pipelineId: entityId });
            toast.success(TOAST_PIPELINE.RUN_STARTED, {
                description: 'Pipeline execution has started',
            });
        } catch (err) {
            toast.error(TOAST_PIPELINE.RUN_START_ERROR, {
                description: err instanceof Error ? err.message : 'Unknown error',
            });
        } finally {
            setIsRunning(false);
        }
    }, [entityId]);

    const handlePublish = React.useCallback(async () => {
        if (!entityId) return;
        setIsPublishing(true);
        try {
            const res = await api.mutate(validatePipelineDefinitionDocument, {
                definition,
            });
            const out = res?.validateDataHubPipelineDefinition as
                | PipelineValidationResult
                | undefined;
            const isValid = Boolean(out?.isValid);
            const issuesArr: ValidationIssue[] = Array.isArray(out?.issues)
                ? out.issues.map((i) => ({
                      message: i.message,
                      stepKey: i.stepKey ?? null,
                      reason: i.reason ?? null,
                      field: i.field ?? null,
                  }))
                : (Array.isArray(out?.errors) ? out.errors : []).map((m) => ({
                      message: String(m),
                  }));

            if (!isValid) {
                onValidationFailed(issuesArr);
                toast.warning(TOAST_PIPELINE.VALIDATION_FIX_REQUIRED, {
                    description: `${issuesArr.length} issue(s) found`,
                });
                return;
            }

            await api.mutate(publishPipelineDocument, { id: entityId });
            toast.success(TOAST_PIPELINE.PUBLISHED, {
                description: 'Pipeline is now live',
            });
            onStatusChange?.();
        } catch (err) {
            toast.error(TOAST_PIPELINE.PUBLISH_ERROR, {
                description: err instanceof Error ? err.message : 'Unknown error',
            });
        } finally {
            setIsPublishing(false);
        }
    }, [entityId, definition, onValidationFailed]);

    if (creating) {
        return (
            <div className="flex items-center gap-2">
                <PipelineImportDialog onImport={onImport} />
            </div>
        );
    }

    const canPublish = status === PIPELINE_STATUS.DRAFT || status === PIPELINE_STATUS.REVIEW;

    return (
        <div className="flex items-center gap-2">
            <PipelineImportDialog onImport={onImport} />
            <PipelineExportDialog definition={definition} />

            <div className="mx-1 h-6 w-px bg-border" />

            <PermissionGuard requires={[DATAHUB_PERMISSIONS.RUN_PIPELINE]}>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenDryRun}
                    className="gap-1.5"
                    data-testid="pipeline-dry-run-button"
                >
                    <FlaskConical className="h-4 w-4" />
                    Dry Run
                </Button>
            </PermissionGuard>

            <PermissionGuard requires={[DATAHUB_PERMISSIONS.RUN_PIPELINE]}>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartRun}
                    disabled={isRunning || status !== PIPELINE_STATUS.PUBLISHED}
                    className="gap-1.5"
                    title={status !== PIPELINE_STATUS.PUBLISHED ? 'Pipeline must be published to run' : undefined}
                    data-testid="pipeline-run-now-button"
                >
                    <Play className="h-4 w-4" />
                    {isRunning ? 'Starting...' : 'Run Now'}
                </Button>
            </PermissionGuard>

            <div className="mx-1 h-6 w-px bg-border" />

            <Button
                variant="ghost"
                size="sm"
                onClick={onOpenHistory}
                className="gap-1.5"
                data-testid="pipeline-history-button"
            >
                <History className="h-4 w-4" />
                History
            </Button>

            {canPublish && (
                <PermissionGuard requires={[DATAHUB_PERMISSIONS.PUBLISH_PIPELINE]}>
                    <Button
                        variant="default"
                        size="sm"
                        onClick={handlePublish}
                        disabled={isPublishing}
                        className="gap-1.5"
                        data-testid="pipeline-publish-button"
                    >
                        <Rocket className="h-4 w-4" />
                        {isPublishing ? 'Publishing...' : 'Publish'}
                    </Button>
                </PermissionGuard>
            )}
        </div>
    );
}
