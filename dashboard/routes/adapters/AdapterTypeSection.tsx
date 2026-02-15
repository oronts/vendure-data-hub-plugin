import * as React from 'react';
import { Button } from '@vendure/dashboard';
import { CheckCircle2, Info, Puzzle } from 'lucide-react';
import { AdapterCard } from './AdapterCard';
import { ADAPTER_TYPE_INFO } from './Constants';
import { ITEMS_PER_PAGE } from '../../constants';
import type { DataHubAdapter } from '../../types';

export function AdapterTypeSection({
    type,
    adapters,
    onSelect,
    isBuiltIn,
}: Readonly<{
    type: 'EXTRACTOR' | 'OPERATOR' | 'LOADER';
    adapters: DataHubAdapter[];
    onSelect: (adapter: DataHubAdapter) => void;
    isBuiltIn: (code: string) => boolean;
}>) {
    const [builtInDisplayCount, setBuiltInDisplayCount] = React.useState(ITEMS_PER_PAGE);
    const [customDisplayCount, setCustomDisplayCount] = React.useState(ITEMS_PER_PAGE);

    const info = ADAPTER_TYPE_INFO[type];
    const builtIn = adapters.filter(a => isBuiltIn(a.code));
    const custom = adapters.filter(a => !isBuiltIn(a.code));

    const displayedBuiltIn = builtIn.slice(0, builtInDisplayCount);
    const displayedCustom = custom.slice(0, customDisplayCount);
    const hasMoreBuiltIn = builtInDisplayCount < builtIn.length;
    const hasMoreCustom = customDisplayCount < custom.length;

    const handleLoadMoreBuiltIn = React.useCallback(() => {
        setBuiltInDisplayCount(c => c + ITEMS_PER_PAGE);
    }, []);

    const handleLoadMoreCustom = React.useCallback(() => {
        setCustomDisplayCount(c => c + ITEMS_PER_PAGE);
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border">
                <div className={`p-2 rounded-lg ${info.color}`}>{info.icon}</div>
                <div>
                    <h3 className="font-semibold">{info.label}</h3>
                    <p className="text-sm text-muted-foreground">{info.description}</p>
                </div>
            </div>

            {builtIn.length > 0 && (
                <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        Built-in Adapters ({builtIn.length})
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                        {displayedBuiltIn.map(adapter => (
                            <AdapterCard
                                key={adapter.code}
                                adapter={adapter}
                                onSelect={onSelect}
                                isBuiltIn
                            />
                        ))}
                    </div>
                    {hasMoreBuiltIn && (
                        <div className="flex justify-center mt-4">
                            <Button variant="outline" onClick={handleLoadMoreBuiltIn} data-testid={`datahub-adapters-load-more-builtin-${type}`}>
                                Load More ({builtIn.length - builtInDisplayCount} remaining)
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {custom.length > 0 && (
                <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <Puzzle className="w-4 h-4 text-purple-600" />
                        Custom Adapters ({custom.length})
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                        {displayedCustom.map(adapter => (
                            <AdapterCard
                                key={adapter.code}
                                adapter={adapter}
                                onSelect={onSelect}
                            />
                        ))}
                    </div>
                    {hasMoreCustom && (
                        <div className="flex justify-center mt-4">
                            <Button variant="outline" onClick={handleLoadMoreCustom} data-testid={`datahub-adapters-load-more-custom-${type}`}>
                                Load More ({custom.length - customDisplayCount} remaining)
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {adapters.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                    <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No {type}s registered yet.</p>
                    <p className="text-sm">Register adapters in your plugin configuration.</p>
                </div>
            )}
        </div>
    );
}
