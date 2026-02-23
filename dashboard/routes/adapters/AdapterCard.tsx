import * as React from 'react';
import { Badge } from '@vendure/dashboard';
import { Puzzle, CheckCircle2, Sparkles } from 'lucide-react';
import { cn } from '../../utils';
import { resolveIconName } from '../../utils/icon-resolver';
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

    const Icon = resolveIconName(adapter.icon);
    const fieldCount = adapter.schema.fields.length;
    const requiredCount = adapter.schema.fields.filter(f => f.required).length;

    return (
        <div
            className={cn(
                'group relative rounded-xl border bg-card p-4 cursor-pointer transition-all duration-200',
                'hover:shadow-lg hover:border-primary/40 hover:-translate-y-0.5',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            )}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`View ${adapter.name ?? adapter.code} adapter details`}
            data-testid={`datahub-adapter-card-${adapter.code}`}
        >
            {/* Header: icon + code + badges */}
            <div className="flex items-start gap-3 mb-3">
                <div className={cn(
                    'flex-shrink-0 p-2 rounded-lg transition-colors',
                    isBuiltIn
                        ? 'bg-primary/10 text-primary group-hover:bg-primary/15'
                        : 'bg-violet-500/10 text-violet-600 dark:text-violet-400 group-hover:bg-violet-500/15',
                )}>
                    {Icon ? <Icon className="w-4 h-4" /> : <Puzzle className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <code className="text-sm font-semibold truncate">{adapter.code}</code>
                    </div>
                    {adapter.name && adapter.name !== adapter.code && (
                        <p className="text-xs text-muted-foreground truncate">{adapter.name}</p>
                    )}
                </div>
                <div className="flex-shrink-0 flex items-center gap-1">
                    {isBuiltIn ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Built-in
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                            <Sparkles className="w-3 h-3" />
                            Custom
                        </Badge>
                    )}
                </div>
            </div>

            {/* Description */}
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-[2rem]">
                {adapter.description || 'No description available'}
            </p>

            {/* Footer: metadata chips */}
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60">
                    {fieldCount} field{fieldCount !== 1 ? 's' : ''}
                </span>
                {requiredCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60">
                        {requiredCount} required
                    </span>
                )}
                {adapter.pure && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        Pure
                    </span>
                )}
            </div>
        </div>
    );
});
