import * as React from 'react';
import { memo } from 'react';
import { AlertCircle } from 'lucide-react';
import type { ValidationErrorDisplayProps } from '../../../types';

export const ValidationErrorDisplay = memo(function ValidationErrorDisplay({
    errors,
    show = true,
    title = 'Please fix the following errors:',
    className = '',
}: ValidationErrorDisplayProps) {
    if (!show || Object.keys(errors).length === 0) return null;

    return (
        <div className={`mb-4 p-3 rounded-lg border border-destructive/50 bg-destructive/10 ${className}`}>
            <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
                <div>
                    <div className="text-sm font-medium text-destructive mb-1">{title}</div>
                    <ul className="text-sm text-destructive/90 list-disc pl-4">
                        {Object.entries(errors).map(([field, error]) => (
                            <li key={field}>{error}</li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
});
