import * as React from 'react';
import { memo } from 'react';
import {
    Badge,
    ScrollArea,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@vendure/dashboard';
import { formatCellValue } from '../../../utils/Formatters';
import { COMPONENT_HEIGHTS, COMPONENT_WIDTHS } from '../../../constants';
import type { DataPreviewProps } from './Types';

function DataPreviewComponent({ data, columns, maxRows = 10 }: DataPreviewProps) {
    const previewData = data.slice(0, maxRows);

    return (
        <div className="border rounded-lg overflow-hidden">
            <ScrollArea className={COMPONENT_HEIGHTS.SCROLL_AREA_MD}>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-12 text-center">#</TableHead>
                            {columns.map(col => (
                                <TableHead key={col.name} className={COMPONENT_WIDTHS.TABLE_HEADER_MIN}>
                                    <div className="flex items-center gap-2">
                                        <span>{col.name}</span>
                                        <Badge variant="outline" className="text-xs">
                                            {col.type}
                                        </Badge>
                                    </div>
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {/* Index as key is acceptable here - preview data is static, read-only, and not reordered */}
                        {previewData.map((row, rowIndex) => (
                            <TableRow key={`preview-row-${rowIndex}`}>
                                <TableCell className="text-center text-muted-foreground">
                                    {rowIndex + 1}
                                </TableCell>
                                {columns.map(col => (
                                    <TableCell key={col.name} className="font-mono text-sm">
                                        {formatCellValue(row[col.name])}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </ScrollArea>
            {data.length > maxRows && (
                <div className="p-2 text-center text-sm text-muted-foreground bg-muted/50">
                    Showing {maxRows} of {data.length.toLocaleString()} rows
                </div>
            )}
        </div>
    );
}

export const DataPreview = memo(DataPreviewComponent);
