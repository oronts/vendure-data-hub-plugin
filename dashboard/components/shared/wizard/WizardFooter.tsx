import * as React from 'react';
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
    completeLabel = 'Complete',
    completeIcon: CompleteIcon,
}: WizardFooterProps) {
    return (
        <div className="flex items-center justify-between p-4 border-t bg-muted/30">
            <Button variant="outline" onClick={onCancel}>
                <X className="w-4 h-4 mr-2" />
                Cancel
            </Button>

            <div className="flex items-center gap-2">
                {currentStep > 0 && (
                    <Button variant="outline" onClick={onBack}>
                        <ChevronLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                )}

                {currentStep < totalSteps - 1 ? (
                    <Button onClick={onNext} disabled={!canProceed}>
                        Next
                        <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                ) : (
                    <Button onClick={onComplete} disabled={!canProceed}>
                        {CompleteIcon && <CompleteIcon className="w-4 h-4 mr-2" />}
                        {completeLabel}
                    </Button>
                )}
            </div>
        </div>
    );
}
