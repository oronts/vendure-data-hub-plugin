import * as React from 'react';
import {
    DataTable,
    Badge,
} from '@vendure/dashboard';
import { ColumnDef } from '@tanstack/react-table';
import { ADAPTER_TYPE_INFO, ADAPTERS_TABLE_PAGE_SIZE } from './Constants';
import type { DataHubAdapter } from '../../types';

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
    const [page, setPage] = React.useState(1);

    const handleSelectAdapter = React.useCallback((adapter: DataHubAdapter) => {
        onSelect(adapter);
    }, [onSelect]);

    const handlePageChange = React.useCallback((newPage: number) => {
        setPage(newPage);
    }, []);

    const columns: ColumnDef<DataHubAdapter, unknown>[] = React.useMemo(() => [
        {
            id: 'type',
            header: 'Type',
            accessorFn: row => row.type,
            cell: ({ row }) => {
                const typeInfo = ADAPTER_TYPE_INFO[row.original.type as keyof typeof ADAPTER_TYPE_INFO];
                return (
                    <Badge className={typeInfo?.color ?? ''}>
                        {row.original.type}
                    </Badge>
                );
            },
        },
        {
            id: 'code',
            header: 'Code',
            accessorFn: row => row.code,
            cell: function CodeCell({ row }) {
                const handleClick = React.useCallback(() => {
                    handleSelectAdapter(row.original);
                }, [row.original]);
                return (
                    <button
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
            header: 'Description',
            accessorFn: row => row.description ?? '',
            cell: ({ row }) => (
                <span className="text-muted-foreground text-sm line-clamp-1">
                    {row.original.description || '—'}
                </span>
            ),
        },
        {
            id: 'fields',
            header: 'Fields',
            accessorFn: row => row.schema.fields.length,
        },
        {
            id: 'source',
            header: 'Source',
            accessorFn: row => (isBuiltIn(row.code) ? 'Built-in' : 'Custom'),
            cell: ({ row }) => (
                <Badge variant={isBuiltIn(row.original.code) ? 'outline' : 'secondary'}>
                    {isBuiltIn(row.original.code) ? 'Built-in' : 'Custom'}
                </Badge>
            ),
        },
    ], [handleSelectAdapter, isBuiltIn]);

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
