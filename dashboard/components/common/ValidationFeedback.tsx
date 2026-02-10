import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import type { FieldErrorProps } from '../../types';

export function FieldError({ error, touched = true, showImmediately = false, className = '' }: FieldErrorProps) {
    if (!error || (!touched && !showImmediately)) return null;

    return (
        <div
            className={`flex items-center gap-1.5 mt-1.5 text-sm text-destructive animate-in fade-in slide-in-from-top-1 duration-200 ${className}`}
            role="alert"
        >
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{error}</span>
        </div>
    );
}
