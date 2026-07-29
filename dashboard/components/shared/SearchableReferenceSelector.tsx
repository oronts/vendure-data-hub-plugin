import * as React from 'react';
import { Trans } from '@lingui/react/macro';
import {
    Button,
    Command,
    CommandInput,
    CommandItem,
    CommandList,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@vendure/dashboard';
import { Check, ChevronsUpDown, Loader2, RefreshCw } from 'lucide-react';
import type { SelectOption } from '../../types';

export type SearchableSelectorOption = Pick<
    SelectOption,
    'value' | 'label' | 'description'
>;

export interface SearchableReferenceSelectorProps {
    id?: string;
    value: string;
    selectedLabel: string;
    options: readonly SearchableSelectorOption[];
    searchTerm: string;
    onSearchTermChange: (value: string) => void;
    onValueChange: (value: string) => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    placeholder: string;
    searchPlaceholder: string;
    emptyMessage: string;
    errorMessage: string;
    allOption?: SearchableSelectorOption;
    disabled?: boolean;
    compact?: boolean;
    className?: string;
    isLoading: boolean;
    isError: boolean;
    onRetry?: () => void;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    remaining: number;
    onLoadMore: () => void;
    'data-testid'?: string;
    'aria-label'?: string;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
}

export function SearchableReferenceSelector({
    id,
    value,
    selectedLabel,
    options,
    searchTerm,
    onSearchTermChange,
    onValueChange,
    open,
    onOpenChange,
    placeholder,
    searchPlaceholder,
    emptyMessage,
    errorMessage,
    allOption,
    disabled = false,
    compact = false,
    className,
    isLoading,
    isError,
    onRetry,
    hasNextPage,
    isFetchingNextPage,
    remaining,
    onLoadMore,
    'data-testid': testId,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
}: SearchableReferenceSelectorProps) {
    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-label={ariaLabel}
                    aria-labelledby={ariaLabelledBy}
                    aria-describedby={ariaDescribedBy}
                    disabled={disabled}
                    data-testid={testId}
                    className={`w-full justify-between font-normal ${compact ? 'h-8 text-sm' : ''} ${className ?? ''}`}
                >
                    <span className="truncate">{selectedLabel || placeholder}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[min(350px,calc(100vw-2rem))] p-0"
                align="start"
            >
                <Command shouldFilter={false}>
                    <CommandInput
                        value={searchTerm}
                        onValueChange={onSearchTermChange}
                        placeholder={searchPlaceholder}
                    />
                    <CommandList>
                        {allOption && (
                            <SelectorItem
                                option={allOption}
                                selected={value === allOption.value}
                                onSelect={onValueChange}
                            />
                        )}
                        {isLoading && (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                                <Trans>Loading...</Trans>
                            </div>
                        )}
                        {isError && (
                            <div className="space-y-2 py-4 text-center text-sm text-muted-foreground">
                                <p>{errorMessage}</p>
                                {onRetry && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={onRetry}
                                    >
                                        <RefreshCw className="mr-2 h-3 w-3" />
                                        <Trans>Retry</Trans>
                                    </Button>
                                )}
                            </div>
                        )}
                        {!isLoading && !isError && options.length === 0 && (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                                {emptyMessage}
                            </div>
                        )}
                        {!isLoading && !isError && options.map(option => (
                            <SelectorItem
                                key={option.value}
                                option={option}
                                selected={value === option.value}
                                onSelect={onValueChange}
                            />
                        ))}
                    </CommandList>
                    {!isLoading && !isError && hasNextPage && (
                        <div className="border-t p-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="w-full"
                                disabled={isFetchingNextPage}
                                onClick={onLoadMore}
                            >
                                {isFetchingNextPage
                                    ? <Trans>Loading...</Trans>
                                    : <Trans>Load {remaining} more</Trans>}
                            </Button>
                        </div>
                    )}
                </Command>
            </PopoverContent>
        </Popover>
    );
}

function SelectorItem({
    option,
    selected,
    onSelect,
}: {
    option: SearchableSelectorOption;
    selected: boolean;
    onSelect: (value: string) => void;
}) {
    return (
        <CommandItem
            value={option.value}
            onSelect={() => onSelect(option.value)}
            className="flex items-start"
        >
            <Check className={`mr-2 mt-0.5 h-4 w-4 ${selected ? 'opacity-100' : 'opacity-0'}`} />
            <span className="flex min-w-0 flex-col">
                <span className="truncate">{option.label}</span>
                {option.description && (
                    <span className="truncate text-xs text-muted-foreground">
                        {option.description}
                    </span>
                )}
            </span>
        </CommandItem>
    );
}
