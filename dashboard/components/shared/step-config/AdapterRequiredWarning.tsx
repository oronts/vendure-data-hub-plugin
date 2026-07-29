import * as React from 'react';
import { memo } from 'react';
import { useLingui } from '@lingui/react/macro';
import { AlertTriangle } from 'lucide-react';

export interface AdapterRequiredWarningProps {
    adapterTypeLabel?: string;
    compact?: boolean;
}

export const AdapterRequiredWarning = memo(function AdapterRequiredWarning({
    adapterTypeLabel = 'adapter',
    compact = false,
}: AdapterRequiredWarningProps) {
    const { t } = useLingui();

    return (
        <div className={`bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md ${compact ? 'p-2.5' : 'p-3'}`}>
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
                <AlertTriangle className={`${compact ? 'h-4 w-4 shrink-0' : 'h-4 w-4'}`} />
                <span className="text-sm font-medium">{t`Select ${adapterTypeLabel}`}</span>
            </div>
            <p className={`text-xs text-amber-700 dark:text-amber-500 mt-1 ${compact ? 'ml-6' : ''}`}>
                {t`This step requires a configured ${adapterTypeLabel}.`}
            </p>
        </div>
    );
});
