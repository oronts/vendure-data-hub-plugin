import * as React from 'react';
import { Badge } from '@vendure/dashboard';
import type { DataHubAdapter } from '../../types';

export const AdapterCard = React.memo(function AdapterCard({
    adapter,
    onSelect,
    isBuiltIn = false,
}: Readonly<{
    adapter: DataHubAdapter;
    onSelect: (adapter: DataHubAdapter) => void;
    isBuiltIn?: boolean;
}>) {
    const handleClick = React.useCallback(() => {
        onSelect(adapter);
    }, [onSelect, adapter]);

    const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(adapter);
        }
    }, [onSelect, adapter]);

    return (
        <div
            className="border rounded-lg p-3 cursor-pointer hover:border-primary hover:shadow-sm transition-all"
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`View ${adapter.name} adapter details`}
            data-testid={`datahub-adapter-card-${adapter.code}`}
        >
            <div className="flex items-start justify-between mb-2">
                <code className="text-sm font-medium">{adapter.code}</code>
                <div className="flex items-center gap-1">
                    {isBuiltIn && (
                        <Badge variant="outline" className="text-xs">
                            Built-in
                        </Badge>
                    )}
                    {adapter.pure && (
                        <Badge variant="secondary" className="text-xs">
                            Pure
                        </Badge>
                    )}
                </div>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                {adapter.description || 'No description'}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{adapter.schema.fields.length} fields</span>
                {adapter.requires && adapter.requires.length > 0 && (
                    <>
                        <span>•</span>
                        <span>Requires: {adapter.requires.join(', ')}</span>
                    </>
                )}
            </div>
        </div>
    );
});
