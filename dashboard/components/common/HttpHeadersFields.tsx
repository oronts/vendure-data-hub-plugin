import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button, Input, Label } from '@vendure/dashboard';
import { PlusCircle, Trash2 } from 'lucide-react';
import {
    rekeyHttpHeaderRow,
    upsertHttpHeaderRow,
} from '../../utils/http-header-rows';
import type { UpdateHttpConnectionConfig } from './connection-config';

interface HttpHeadersFieldsProps {
    headers?: Record<string, string>;
    updateConfig: UpdateHttpConnectionConfig;
    disabled?: boolean;
}

interface HeaderRow {
    id: string;
    name: string;
    value: string;
}

export function HttpHeadersFields({
    headers,
    updateConfig,
    disabled,
}: HttpHeadersFieldsProps) {
    const rowIds = React.useRef<Map<string, string>>(new Map());
    const rows = React.useMemo(() => createHeaderRows(headers, rowIds), [headers]);
    const [pendingRow, setPendingRow] = React.useState<HeaderRow | null>(null);
    const visibleRows = pendingRow
        ? rows.filter(row => row.id !== pendingRow.id)
        : rows;
    const commit = (nextRows: HeaderRow[]) => {
        const populatedRows = nextRows.filter(row => row.name.trim());
        updateConfig({
            headers: populatedRows.length > 0
                ? Object.fromEntries(populatedRows.map(row => [
                    row.name.trim(),
                    row.value,
                ]))
                : undefined,
        });
    };

    return (
        <div className="space-y-3" role="group" aria-labelledby="default-headers-label">
            <HttpHeadersHeading
                onAdd={() => setPendingRow(createHeaderRow())}
                disabled={disabled}
            />
            {rows.length === 0 && !pendingRow && (
                <p className="text-sm text-muted-foreground">
                    <Trans>No headers configured.</Trans>
                </p>
            )}
            {visibleRows.map(row => (
                <HttpHeaderRow
                    key={row.id}
                    row={row}
                    rows={visibleRows}
                    rowIds={rowIds}
                    onChange={commit}
                    disabled={disabled}
                />
            ))}
            {pendingRow && (
                <PendingHttpHeaderRow
                    row={pendingRow}
                    rows={visibleRows}
                    rowIds={rowIds}
                    onChange={setPendingRow}
                    onCommit={commit}
                    onRemove={() => {
                        commit(visibleRows);
                        setPendingRow(null);
                    }}
                    disabled={disabled}
                />
            )}
        </div>
    );
}

function HttpHeadersHeading({
    onAdd,
    disabled,
}: {
    onAdd: () => void;
    disabled?: boolean;
}) {
    const { t } = useLingui();
    return (
        <div className="flex items-center justify-between">
            <div>
                <Label id="default-headers-label" className="text-sm font-medium">
                    <Trans>Default Headers</Trans>
                </Label>
                <p className="text-xs text-muted-foreground">
                    <Trans>Headers sent with every request.</Trans>
                </p>
            </div>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAdd}
                disabled={disabled}
                aria-label={t`Add new HTTP header`}
            >
                <PlusCircle className="w-4 h-4 mr-2" />
                <Trans>Add header</Trans>
            </Button>
        </div>
    );
}

interface HttpHeaderRowProps {
    row: HeaderRow;
    rows: HeaderRow[];
    rowIds: React.MutableRefObject<Map<string, string>>;
    onChange: (rows: HeaderRow[]) => void;
    disabled?: boolean;
}

function HttpHeaderRow({
    row,
    rows,
    rowIds,
    onChange,
    disabled,
}: HttpHeaderRowProps) {
    const { t } = useLingui();
    const update = (patch: Partial<HeaderRow>) => {
        onChange(rows.map(item => item.id === row.id ? { ...item, ...patch } : item));
    };
    return (
        <div className="grid grid-cols-[1fr,1fr,auto] gap-3">
            <Input
                placeholder={t`Header Name`}
                value={row.name}
                onChange={event => {
                    rekeyHttpHeaderRow(
                        rowIds.current,
                        row.name,
                        event.target.value,
                        row.id,
                    );
                    update({ name: event.target.value });
                }}
                disabled={disabled}
                aria-label={t`Header name for ${row.name}`}
            />
            <Input
                placeholder={t`Header Value`}
                value={row.value}
                onChange={event => update({ value: event.target.value })}
                disabled={disabled}
                aria-label={t`Header value for ${row.name}`}
            />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(rows.filter(item => item.id !== row.id))}
                disabled={disabled}
                aria-label={t`Remove ${row.name} header`}
            >
                <Trash2 className="w-4 h-4" />
            </Button>
        </div>
    );
}

interface PendingHttpHeaderRowProps {
    row: HeaderRow;
    rows: HeaderRow[];
    rowIds: React.MutableRefObject<Map<string, string>>;
    onChange: (row: HeaderRow) => void;
    onCommit: (rows: HeaderRow[]) => void;
    onRemove: () => void;
    disabled?: boolean;
}

function PendingHttpHeaderRow({
    row,
    rows,
    rowIds,
    onChange,
    onCommit,
    onRemove,
    disabled,
}: PendingHttpHeaderRowProps) {
    const { t } = useLingui();
    const update = (patch: Partial<HeaderRow>) => {
        const nextRow = { ...row, ...patch };
        if (patch.name !== undefined) {
            rekeyHttpHeaderRow(
                rowIds.current,
                row.name,
                nextRow.name,
                row.id,
            );
        }
        onChange(nextRow);
        onCommit(upsertHttpHeaderRow(rows, nextRow));
    };
    return (
        <div className="grid grid-cols-[1fr,1fr,auto] gap-3">
            <Input
                placeholder={t`Header Name`}
                value={row.name}
                autoFocus
                onChange={event => update({ name: event.target.value })}
                disabled={disabled}
                aria-label={t`Header Name`}
            />
            <Input
                placeholder={t`Header Value`}
                value={row.value}
                onChange={event => update({ value: event.target.value })}
                disabled={disabled}
                aria-label={t`Header value for ${row.name}`}
            />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onRemove}
                disabled={disabled}
                aria-label={t`Remove ${row.name} header`}
            >
                <Trash2 className="w-4 h-4" />
            </Button>
        </div>
    );
}

function createHeaderRows(
    headers: Record<string, string> | undefined,
    rowIds: React.MutableRefObject<Map<string, string>>,
): HeaderRow[] {
    if (!headers) {
        rowIds.current.clear();
        return [];
    }
    const nextIds = new Map<string, string>();
    const rows = Object.entries(headers).map(([name, value]) => {
        const id = rowIds.current.get(name) ?? createRowId();
        nextIds.set(name, id);
        return { id, name, value };
    });
    rowIds.current = nextIds;
    return rows;
}

function createHeaderRow(): HeaderRow {
    return { id: createRowId(), name: '', value: '' };
}

function createRowId(): string {
    return (
        globalThis.crypto?.randomUUID?.()
        ?? Math.random().toString(36).slice(2, 10)
    ).slice(0, 8);
}
