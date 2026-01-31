import * as React from 'react';
import { memo } from 'react';
import { Check } from 'lucide-react';

interface StepIndicatorProps {
    number: number;
    label: string;
    active: boolean;
    completed: boolean;
}

function StepIndicatorComponent({ number, label, active, completed }: StepIndicatorProps) {
    return (
        <div className="flex items-center gap-2">
            <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    completed ? 'bg-green-500 text-white'
                    : active ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
            >
                {completed ? <Check className="w-4 h-4" /> : number}
            </div>
            <span className={active || completed ? 'font-medium' : 'text-muted-foreground'}>
                {label}
            </span>
        </div>
    );
}

export const StepIndicator = memo(StepIndicatorComponent);
