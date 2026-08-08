import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
import { usePermissions } from '@vendure/dashboard';
import {
    useInfiniteConnectionReferences,
    useInfiniteSecretReferences,
} from '../../hooks/api';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { DATAHUB_PERMISSIONS, DEBOUNCE_DELAYS } from '../../constants';
import { SearchableReferenceSelector } from './SearchableReferenceSelector';
import type { SearchableSelectorOption } from './SearchableReferenceSelector';

export type ReferenceResource = 'connection' | 'secret';

export interface ResourceReferenceSelectorProps {
    id?: string;
    resource: ReferenceResource;
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    compact?: boolean;
    allowClear?: boolean;
    'data-testid'?: string;
    'aria-label'?: string;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
    'aria-required'?: boolean;
}

export function ResourceReferenceSelector({
    id,
    resource,
    value,
    onValueChange,
    placeholder,
    disabled = false,
    compact = false,
    allowClear = false,
    'data-testid': testId,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    'aria-required': ariaRequired,
}: ResourceReferenceSelectorProps) {
    const { t } = useLingui();
    const [open, setOpen] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState('');
    const { hasPermissions } = usePermissions();
    const requiredPermission = resource === 'connection'
        ? DATAHUB_PERMISSIONS.MANAGE_CONNECTIONS
        : DATAHUB_PERMISSIONS.READ_SECRET;
    const canReadResource = hasPermissions([requiredPermission]);
    const debouncedSearch = useDebouncedValue(searchTerm, DEBOUNCE_DELAYS.DEFAULT);
    const connectionQuery = useInfiniteConnectionReferences(
        debouncedSearch,
        open && canReadResource && resource === 'connection',
    );
    const secretQuery = useInfiniteSecretReferences(
        debouncedSearch,
        open && canReadResource && resource === 'secret',
    );
    const connectionItems = connectionQuery.data?.pages.flatMap(page => page.items) ?? [];
    const secretItems = secretQuery.data?.pages.flatMap(page => page.items) ?? [];
    const options: SearchableSelectorOption[] = resource === 'connection'
        ? connectionItems.map(item => ({
            value: item.code,
            label: item.code,
            description: item.type,
        }))
        : secretItems.map(item => ({
            value: item.code,
            label: item.code,
            description: item.provider,
        }));
    const activeQuery = resource === 'connection' ? connectionQuery : secretQuery;
    const totalItems = activeQuery.data?.pages[0]?.totalItems ?? 0;
    const text = resource === 'connection'
        ? {
            placeholder: t`Select connection...`,
            search: t`Search connections...`,
            empty: t`No connections found.`,
            error: t`Could not load connections. Try again.`,
            permission: t`You do not have permission to list Data Hub connections.`,
        }
        : {
            placeholder: t`Select secret...`,
            search: t`Search secrets...`,
            empty: t`No secrets found.`,
            error: t`Could not load secrets. Try again.`,
            permission: t`You do not have permission to list Data Hub secrets.`,
        };

    const handleOpenChange = React.useCallback((nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearchTerm('');
    }, []);

    const handleValueChange = React.useCallback((nextValue: string) => {
        onValueChange(nextValue);
        setOpen(false);
        setSearchTerm('');
    }, [onValueChange]);

    return (
        <SearchableReferenceSelector
            id={id}
            value={value}
            selectedLabel={value}
            options={options}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            onValueChange={handleValueChange}
            open={open}
            onOpenChange={handleOpenChange}
            placeholder={placeholder ?? text.placeholder}
            searchPlaceholder={text.search}
            emptyMessage={text.empty}
            errorMessage={canReadResource
                ? text.error
                : text.permission}
            allOption={allowClear ? {
                value: '',
                label: t`None`,
            } : undefined}
            disabled={disabled}
            compact={compact}
            isLoading={activeQuery.isLoading}
            isError={!canReadResource || activeQuery.isError}
            onRetry={canReadResource ? () => void activeQuery.refetch() : undefined}
            hasNextPage={activeQuery.hasNextPage}
            isFetchingNextPage={activeQuery.isFetchingNextPage}
            remaining={Math.max(0, totalItems - options.length)}
            onLoadMore={() => void activeQuery.fetchNextPage()}
            data-testid={testId}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            aria-required={ariaRequired}
        />
    );
}
