import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button } from '@vendure/dashboard';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import type { WizardFooterProps } from '../../../types';

export function WizardFooter({
    currentStep,
    totalSteps,
    canProceed,
    onBack,
    onNext,
    onComplete,
    onCancel,
    completeLabel,
    completeIcon: CompleteIcon,
    isSubmitting,
}: WizardFooterProps) {
    const { t } = useLingui();
    return (
        <div className="flex flex-col gap-3 border-t bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <Button className="w-full sm:w-auto" variant="outline" onClick={onCancel}>
                <X className="w-4 h-4 mr-2" />
                <Trans>Cancel</Trans>
            </Button>

            <div className="flex w-full items-center gap-2 sm:w-auto">
                {currentStep > 0 && (
                    <Button className="flex-1 sm:flex-none" variant="outline" onClick={onBack}>
                        <ChevronLeft className="w-4 h-4 mr-2" />
                        <Trans>Back</Trans>
                    </Button>
                )}

                {currentStep < totalSteps - 1 ? (
                    <Button className="flex-1 sm:flex-none" onClick={onNext} disabled={!canProceed}>
                        <Trans>Next</Trans>
                        <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                ) : (
                    <Button className="flex-1 sm:flex-none" onClick={onComplete} disabled={!canProceed || isSubmitting}>
                        {CompleteIcon && <CompleteIcon className="w-4 h-4 mr-2" />}
                        {isSubmitting
                            ? t`Creating...`
                            : completeLabel ?? t`Complete`}
                    </Button>
                )}
            </div>
        </div>
    );
}
