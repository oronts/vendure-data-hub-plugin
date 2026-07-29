import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';

import { Button, PermissionGuard } from '@vendure/dashboard';
import { toast } from 'sonner';
import {
    Play,
    History,
    FlaskConical,
} from 'lucide-react';
import { PipelineImportDialog } from '../../../components/pipelines/PipelineImport';
import { PipelineExportDialog } from '../../../components/pipelines/PipelineExport';
import {
    DATAHUB_PERMISSIONS,
    PIPELINE_STATUS,
} from '../../../constants';
import type { PipelineStatus } from '../../../constants';
import {
    useRunPipeline,
} from '../../../hooks';
import type { PipelineDefinition } from '../../../types';
import { getPipelineExecutionPermissions } from '../../../utils/pipeline-permissions';
import { AllPermissionsGuard } from '../../../components/shared';

export interface PipelineActionButtonsProps {
    entityId?: string;
    status?: PipelineStatus;
    enabled?: boolean;
    currentRevisionId?: string | number | null;
    publishedVersionCount?: number;
    definition?: PipelineDefinition;
    creating: boolean;
    hasUnsavedChanges: boolean;
    managedByCodeFirst: boolean;
    onImport: (def: PipelineDefinition) => void;
    onOpenDryRun: () => void;
    onOpenHistory: () => void;
}

export function PipelineActionButtons({
    entityId,
    status,
    enabled,
    currentRevisionId,
    publishedVersionCount,
    definition,
    creating,
    hasUnsavedChanges,
    managedByCodeFirst,
    onImport,
    onOpenDryRun,
    onOpenHistory,
}: Readonly<PipelineActionButtonsProps>) {
    const { t } = useLingui();
    const runPipeline = useRunPipeline();
    const { mutate: startPipelineRun } = runPipeline;

    const handleStartRun = React.useCallback(() => {
        if (!entityId) return;
        if (currentRevisionId == null) return;
        startPipelineRun({
            pipelineId: entityId,
            expectedRevisionId: currentRevisionId,
        }, {
            onSuccess: () => {
                toast.success(t`Pipeline run started`, {
                    description: t`Pipeline execution has started`,
                });
            },
        });
    }, [currentRevisionId, entityId, startPipelineRun, t]);

    const isRunning = runPipeline.isPending;

    if (creating) {
        return (
            <div className="flex items-center gap-2">
                <PipelineImportDialog onImport={onImport} />
            </div>
        );
    }

    const executionPermissions = getPipelineExecutionPermissions(
        definition,
        DATAHUB_PERMISSIONS.RUN_PIPELINE,
    );
    const publishedVersion = publishedVersionCount ?? 0;
    const runDisabledReason = status === PIPELINE_STATUS.ARCHIVED
        ? t`Reactivate`
        : enabled === false
            ? t`Pipeline is published but disabled. Enable and save it before running.`
            : currentRevisionId == null
                ? t`Pipeline must be published to run`
                : undefined;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {!managedByCodeFirst && (
                <PermissionGuard requires={[DATAHUB_PERMISSIONS.UPDATE_PIPELINE]}>
                    <PipelineImportDialog onImport={onImport} />
                </PermissionGuard>
            )}
            <PipelineExportDialog definition={definition} />

            <div className="mx-1 hidden sm:block h-6 w-px bg-border" />

            <AllPermissionsGuard requires={executionPermissions}>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenDryRun}
                    className="gap-1.5"
                    disabled={hasUnsavedChanges}
                    title={hasUnsavedChanges
                        ? t`Save changes before running a dry run`
                        : undefined}
                    data-testid="pipeline-dry-run-button"
                >
                    <FlaskConical className="h-4 w-4" />
                    <Trans>Dry run</Trans>
                </Button>
            </AllPermissionsGuard>

            <AllPermissionsGuard requires={executionPermissions}>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartRun}
                    disabled={isRunning || runDisabledReason != null}
                    className="gap-1.5"
                    title={runDisabledReason}
                    data-testid="pipeline-run-now-button"
                >
                    <Play className="h-4 w-4" />
                    {isRunning
                        ? <Trans>Starting...</Trans>
                        : currentRevisionId != null
                            ? <Trans>Run published v{publishedVersion}</Trans>
                            : <Trans>Run now</Trans>}
                </Button>
            </AllPermissionsGuard>

            <div className="mx-1 hidden sm:block h-6 w-px bg-border" />

            <Button
                variant="ghost"
                size="sm"
                onClick={onOpenHistory}
                className="gap-1.5"
                data-testid="pipeline-history-button"
            >
                <History className="h-4 w-4" />
                <Trans>History</Trans>
            </Button>

        </div>
    );
}
