import * as React from 'react';
import { memo } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface AdapterRequiredWarningProps {
    adapterTypeLabel?: string;
    compact?: boolean;
}

export const AdapterRequiredWarning = memo(function AdapterRequiredWarning({
    adapterTypeLabel = 'adapter',
    compact = false,
}: AdapterRequiredWarningProps) {
    return (
        <div className={`bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md ${compact ? 'p-2.5' : 'p-3'}`}>
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
                <AlertTriangle className={`${compact ? 'h-4 w-4 shrink-0' : 'h-4 w-4'}`} />
                <span className="text-sm font-medium">Select {adapterTypeLabel.startsWith('a') ? 'an' : 'a'} {adapterTypeLabel}</span>
            </div>
            <p className={`text-xs text-amber-700 mt-1 ${compact ? 'ml-6' : ''}`}>
                This step requires {adapterTypeLabel.startsWith('a') ? 'an' : 'a'} {adapterTypeLabel} to be configured.
            </p>
        </div>
    );
});
