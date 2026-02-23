import * as React from 'react';
import { memo, useCallback } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { WizardProgressBarProps, WizardStep } from '../../../types';
import { PROGRESS_BAR_STYLES, ICON_SIZES } from '../../../constants';

interface ProgressStepButtonProps {
    step: WizardStep;
    index: number;
    currentStep: number;
    stepsLength: number;
    onStepClick: (index: number) => void;
}

const ProgressStepButton = memo(function ProgressStepButton({
    step,
    index,
    currentStep,
    stepsLength,
    onStepClick,
}: ProgressStepButtonProps) {
    const Icon = step.icon;
    const isActive = index === currentStep;
    const isCompleted = index < currentStep;
    const styleClass = isActive
        ? PROGRESS_BAR_STYLES.ACTIVE
        : isCompleted
            ? PROGRESS_BAR_STYLES.COMPLETED
            : PROGRESS_BAR_STYLES.PENDING;

    const handleClick = useCallback(() => {
        if (index < currentStep) {
            onStepClick(index);
        }
    }, [index, currentStep, onStepClick]);

    return (
        <React.Fragment>
            <button
                type="button"
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${styleClass}`}
                onClick={handleClick}
                disabled={index > currentStep}
                aria-current={isActive ? 'step' : undefined}
                aria-label={step.label}
            >
                {isCompleted ? (
                    <Check className={ICON_SIZES.SM} />
                ) : (
                    <Icon className={ICON_SIZES.SM} />
                )}
                <span className="text-sm font-medium hidden lg:inline">{step.label}</span>
            </button>
            {index < stepsLength - 1 && (
                <ChevronRight className={`${ICON_SIZES.SM} text-muted-foreground`} />
            )}
        </React.Fragment>
    );
});

function WizardProgressBarComponent({ steps, currentStep, onStepClick }: WizardProgressBarProps) {
    return (
        <div className="flex items-center gap-2 p-4 border-b bg-muted/30">
            {steps.map((step, index) => (
                <ProgressStepButton
                    key={step.id}
                    step={step}
                    index={index}
                    currentStep={currentStep}
                    stepsLength={steps.length}
                    onStepClick={onStepClick}
                />
            ))}
        </div>
    );
}

export const WizardProgressBar = memo(WizardProgressBarComponent);
