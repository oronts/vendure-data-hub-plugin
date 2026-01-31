import * as React from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { WizardProgressBarProps } from '../../../types';
import { PROGRESS_BAR_STYLES, ICON_SIZES } from '../../../constants';

export function WizardProgressBar({ steps, currentStep, onStepClick }: WizardProgressBarProps) {
    const handleStepClick = React.useCallback((index: number) => {
        if (index < currentStep) {
            onStepClick(index);
        }
    }, [currentStep, onStepClick]);

    return (
        <div className="flex items-center gap-2 p-4 border-b bg-muted/30">
            {steps.map((step, index) => {
                const Icon = step.icon;
                const isActive = index === currentStep;
                const isCompleted = index < currentStep;
                const styleClass = isActive
                    ? PROGRESS_BAR_STYLES.ACTIVE
                    : isCompleted
                        ? PROGRESS_BAR_STYLES.COMPLETED
                        : PROGRESS_BAR_STYLES.PENDING;

                return (
                    <React.Fragment key={step.id}>
                        <button
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${styleClass}`}
                            onClick={() => handleStepClick(index)}
                            disabled={index > currentStep}
                        >
                            {isCompleted ? (
                                <Check className={ICON_SIZES.SM} />
                            ) : (
                                <Icon className={ICON_SIZES.SM} />
                            )}
                            <span className="text-sm font-medium hidden lg:inline">{step.label}</span>
                        </button>
                        {index < steps.length - 1 && (
                            <ChevronRight className={`${ICON_SIZES.SM} text-muted-foreground`} />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}
