import * as React from 'react';

export interface WizardStepContainerProps {
    title: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
}

export function WizardStepContainer({
    title,
    description,
    children,
    className = '',
}: WizardStepContainerProps) {
    return (
        <div className={`max-w-4xl mx-auto space-y-6 ${className}`}>
            <div>
                <h2 className="text-2xl font-semibold mb-2">{title}</h2>
                {description && (
                    <p className="text-muted-foreground">{description}</p>
                )}
            </div>
            {children}
        </div>
    );
}
