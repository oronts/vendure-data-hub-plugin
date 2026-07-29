import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@vendure/dashboard';
import { toast } from 'sonner';
import { getErrorMessage } from '../../../../shared';
import {
    DIALOG_DIMENSIONS,
} from '../../../constants';
import { useDryRunPipeline } from '../../../hooks';
import type { DryRunResult } from '../../../types';
import {
    DryRunDialogFooter,
    DryRunTabs,
} from './DryRunTabs';
import type { DryRunTab } from './DryRunTabs';

export interface DryRunDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pipelineId: string | undefined;
}

export function DryRunDialog({
    open,
    onOpenChange,
    pipelineId,
}: DryRunDialogProps) {
    const { t } = useLingui();
    const dryRun = useDryRunPipeline(pipelineId);
    const {
        data: dryRunData,
        error: dryRunFailure,
        isPending: isDryRunPending,
        mutate: runDryRun,
        reset: resetDryRun,
    } = dryRun;
    const [hasAttempted, setHasAttempted] = React.useState(false);
    const [dryRunTab, setDryRunTab] = React.useState<DryRunTab>('summary');
    const dryRunResult: DryRunResult | null = dryRunData ?? null;
    const dryRunError = dryRunFailure ? getErrorMessage(dryRunFailure) : null;

    const handleDryRun = React.useCallback(() => {
        if (!pipelineId) return;
        setHasAttempted(true);
        runDryRun(undefined, {
            onError: error => {
                toast.error(
                    t`Dry run failed`,
                    { description: getErrorMessage(error) },
                );
            },
        });
    }, [pipelineId, runDryRun, t]);

    const handleClose = React.useCallback(() => {
        onOpenChange(false);
    }, [onOpenChange]);

    React.useEffect(() => {
        if (open && pipelineId && !hasAttempted && !isDryRunPending) {
            handleDryRun();
        }
    }, [open, pipelineId, hasAttempted, isDryRunPending, handleDryRun]);

    React.useEffect(() => {
        if (!open) {
            resetDryRun();
            setHasAttempted(false);
            setDryRunTab('summary');
        }
    }, [open, resetDryRun]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={`${DIALOG_DIMENSIONS.MAX_WIDTH_4XL} ${DIALOG_DIMENSIONS.MAX_HEIGHT_85VH} overflow-hidden flex flex-col`}
                data-testid="dry-run-dialog"
            >
                <DialogHeader>
                    <DialogTitle>
                        <Trans>Dry run</Trans>
                    </DialogTitle>
                    <DialogDescription>
                        {isDryRunPending
                            ? <Trans>Running dry run...</Trans>
                            : <Trans>Preview pipeline execution without making changes</Trans>}
                    </DialogDescription>
                </DialogHeader>
                <DryRunTabs
                    tab={dryRunTab}
                    onTabChange={setDryRunTab}
                    isPending={isDryRunPending}
                    error={dryRunError}
                    result={dryRunResult}
                    onRun={handleDryRun}
                />
                <DryRunDialogFooter
                    isPending={isDryRunPending}
                    onRun={handleDryRun}
                    onClose={handleClose}
                />
            </DialogContent>
        </Dialog>
    );
}
