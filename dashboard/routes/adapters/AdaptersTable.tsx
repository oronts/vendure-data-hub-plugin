import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
import {
    DataTable,
    Badge,
} from '@vendure/dashboard';
import { ColumnDef } from '@tanstack/react-table';
import { ADAPTERS_TABLE_PAGE_SIZE } from './AdapterConstants';
import type { DataHubAdapter } from '../../types';
import { AdapterLifecycleBadges } from './AdapterLifecycleBadges';

export function AdaptersTable({
    adapters,
    onSelect,
    isBuiltIn,
    isLoading,
}: Readonly<{
    adapters: DataHubAdapter[];
    onSelect: (adapter: DataHubAdapter) => void;
    isBuiltIn: (code: string) => boolean;
    isLoading: boolean;
}>) {
    const { t } = useLingui();
    const [page, setPage] = React.useState(1);

    const handleSelectAdapter = React.useCallback((adapter: DataHubAdapter) => {
        onSelect(adapter);
    }, [onSelect]);

    const handlePageChange = React.useCallback((_table: unknown, newPage: number) => {
        setPage(newPage);
    }, []);

    const columns: ColumnDef<DataHubAdapter, unknown>[] = React.useMemo(() => [
        {
            id: 'type',
            header: t`Type`,
            accessorFn: row => row.type,
            cell: ({ row }) => (
                <Badge variant="outline">
                    {row.original.type}
                </Badge>
            ),
        },
        {
            id: 'code',
            header: t`Code`,
            accessorFn: row => row.code,
            cell: function CodeCell({ row }) {
                const handleClick = React.useCallback(() => {
                    handleSelectAdapter(row.original);
                }, [row.original]);
                return (
                    <button
                        type="button"
                        className="font-mono text-sm underline-offset-2 hover:underline"
                        onClick={handleClick}
                    >
                        {row.original.code}
                    </button>
                );
            },
        },
        {
            id: 'description',
            header: t`Description`,
            accessorFn: row => row.description ?? '',
            cell: ({ row }) => (
                <span className="text-muted-foreground text-sm line-clamp-1">
                    {row.original.description || '—'}
                </span>
            ),
        },
        {
            id: 'lifecycle',
            header: t`Lifecycle`,
            accessorFn: row => `${row.version ?? ''}:${row.deprecated === true}`,
            cell: ({ row }) => (
                <AdapterLifecycleBadges
                    version={row.original.version}
                    deprecated={row.original.deprecated}
                />
            ),
        },
        {
            id: 'fields',
            header: t`Fields`,
            accessorFn: row => row.schema.fields.length,
        },
        {
            id: 'source',
            header: t`Source`,
            accessorFn: row => isBuiltIn(row.code) ? t`Built-in` : t`Custom`,
            cell: ({ row }) => (
                <Badge variant={isBuiltIn(row.original.code) ? 'outline' : 'secondary'}>
                    {isBuiltIn(row.original.code) ? t`Built-in` : t`Custom`}
                </Badge>
            ),
        },
    ], [handleSelectAdapter, isBuiltIn, t]);

    // Client-side pagination for the adapters table
    const paginatedAdapters = React.useMemo(() => {
        const start = (page - 1) * ADAPTERS_TABLE_PAGE_SIZE;
        return adapters.slice(start, start + ADAPTERS_TABLE_PAGE_SIZE);
    }, [adapters, page]);

    return (
        <DataTable
            columns={columns}
            data={paginatedAdapters}
            isLoading={isLoading}
            totalItems={adapters.length}
            itemsPerPage={ADAPTERS_TABLE_PAGE_SIZE}
            page={page}
            onPageChange={handlePageChange}
            disableViewOptions
            data-testid="datahub-adapters-table"
        />
    );
}
