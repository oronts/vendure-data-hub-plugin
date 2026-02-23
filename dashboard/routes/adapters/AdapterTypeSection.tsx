import * as React from 'react';
import { CheckCircle2, Info, Puzzle, Sparkles } from 'lucide-react';
import { Badge } from '@vendure/dashboard';
import { AdapterCard } from './AdapterCard';
import { ITEMS_PER_PAGE } from '../../constants';
import { useLoadMore } from '../../hooks';
import { LoadMoreButton } from '../../components/shared';
import { resolveIconName } from '../../utils/icon-resolver';
import type { DataHubAdapter } from '../../types';

export function AdapterTypeSection({
    type,
    label,
    description,
    icon,
    adapters,
    onSelect,
    isBuiltIn,
}: Readonly<{
    type: string;
    label: string;
    description?: string;
    icon?: string;
    adapters: DataHubAdapter[];
    onSelect: (adapter: DataHubAdapter) => void;
    isBuiltIn: (code: string) => boolean;
}>) {
    const Icon = resolveIconName(icon);
    const builtIn = React.useMemo(() => adapters.filter(a => isBuiltIn(a.code)), [adapters, isBuiltIn]);
    const custom = React.useMemo(() => adapters.filter(a => !isBuiltIn(a.code)), [adapters, isBuiltIn]);

    const { displayed: displayedBuiltIn, hasMore: hasMoreBuiltIn, remaining: remainingBuiltIn, loadMore: loadMoreBuiltIn } = useLoadMore(builtIn, { pageSize: ITEMS_PER_PAGE });
    const { displayed: displayedCustom, hasMore: hasMoreCustom, remaining: remainingCustom, loadMore: loadMoreCustom } = useLoadMore(custom, { pageSize: ITEMS_PER_PAGE });

    return (
        <div className="space-y-6">
            {/* Section header */}
            <div className="flex items-center gap-3 pb-4 border-b">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                    {Icon ? <Icon className="w-5 h-5" /> : <Puzzle className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{label}</h3>
                        <Badge variant="secondary" className="text-xs">
                            {adapters.length}
                        </Badge>
                    </div>
                    {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
                </div>
            </div>

            {builtIn.length > 0 && (
                <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-muted-foreground">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        Built-in
                        <span className="text-xs font-normal">({builtIn.length})</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {displayedBuiltIn.map(adapter => (
                            <AdapterCard
                                key={adapter.code}
                                adapter={adapter}
                                onSelect={onSelect}
                                isBuiltIn
                            />
                        ))}
                    </div>
                    {hasMoreBuiltIn && <LoadMoreButton remaining={remainingBuiltIn} onClick={loadMoreBuiltIn} data-testid={`datahub-adapters-load-more-builtin-${type}`} />}
                </div>
            )}

            {custom.length > 0 && (
                <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-muted-foreground">
                        <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                        Custom
                        <span className="text-xs font-normal">({custom.length})</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {displayedCustom.map(adapter => (
                            <AdapterCard
                                key={adapter.code}
                                adapter={adapter}
                                onSelect={onSelect}
                            />
                        ))}
                    </div>
                    {hasMoreCustom && <LoadMoreButton remaining={remainingCustom} onClick={loadMoreCustom} data-testid={`datahub-adapters-load-more-custom-${type}`} />}
                </div>
            )}

            {adapters.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                    <div className="mx-auto w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                        <Info className="w-6 h-6 opacity-50" />
                    </div>
                    <p className="font-medium">No {label.toLowerCase()} registered</p>
                    <p className="text-sm mt-1">Register adapters in your plugin configuration.</p>
                </div>
            )}
        </div>
    );
}
