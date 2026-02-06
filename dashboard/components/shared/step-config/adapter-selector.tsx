import * as React from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Input,
    ScrollArea,
    Badge,
} from '@vendure/dashboard';
import { Search, Loader2 } from 'lucide-react';
import { useAdaptersByType } from '../../../hooks';
import { filterAndGroupAdaptersByCategory } from '../../../utils';
import { COMPONENT_HEIGHTS, SELECT_WIDTHS } from '../../../constants';
import type { AdapterSelectorProps } from '../../../types';

export function AdapterSelector({
    stepType,
    value,
    onChange,
    placeholder = 'Select adapter...',
    disabled = false,
    adapters: propAdapters,
}: AdapterSelectorProps) {
    const [search, setSearch] = React.useState('');
    const { data: hookAdapters, isLoading } = useAdaptersByType(stepType);
    const adapters = propAdapters || hookAdapters;

    const groupedAdapters = React.useMemo(
        () => filterAndGroupAdaptersByCategory(adapters ?? [], search),
        [adapters, search]
    );

    const selectedAdapter = adapters?.find((a) => a.code === value);

    if (isLoading && !propAdapters) {
        return (
            <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-muted">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading adapters...</span>
            </div>
        );
    }

    return (
        <Select value={value} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger className="w-full">
                <SelectValue placeholder={placeholder}>
                    {selectedAdapter && (
                        <div className="flex items-center gap-2">
                            <span>{selectedAdapter.name}</span>
                            {selectedAdapter.category && (
                                <Badge variant="secondary" className="text-xs">
                                    {selectedAdapter.category}
                                </Badge>
                            )}
                        </div>
                    )}
                </SelectValue>
            </SelectTrigger>
            <SelectContent className={SELECT_WIDTHS.ADAPTER_SELECTOR}>
                <div className="p-2 border-b">
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search adapters..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                </div>

                <ScrollArea className={COMPONENT_HEIGHTS.LIST_PANE_MD}>
                    {Object.keys(groupedAdapters).length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                            No adapters found
                        </div>
                    ) : (
                        Object.entries(groupedAdapters).map(([category, categoryAdapters]) => (
                            <div key={category} className="py-1">
                                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    {category}
                                </div>
                                {categoryAdapters.map((adapter) => (
                                    <SelectItem
                                        key={adapter.code}
                                        value={adapter.code}
                                        className="py-2"
                                    >
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-medium">{adapter.name}</span>
                                            {adapter.description && (
                                                <span className="text-xs text-muted-foreground line-clamp-1">
                                                    {adapter.description}
                                                </span>
                                            )}
                                        </div>
                                    </SelectItem>
                                ))}
                            </div>
                        ))
                    )}
                </ScrollArea>
            </SelectContent>
        </Select>
    );
}
