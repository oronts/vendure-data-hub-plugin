import * as React from 'react';
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
import { formatCellValue } from './helpers';
import type { DataPreviewProps } from './types';

export function DataPreview({ data, columns, maxRows = 10 }: DataPreviewProps) {
    const previewData = data.slice(0, maxRows);

    return (
        <div className="border rounded-lg overflow-hidden">
            <ScrollArea className="max-h-[400px]">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-12 text-center">#</TableHead>
                            {columns.map(col => (
                                <TableHead key={col.name} className="min-w-[120px]">
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
                        {previewData.map((row, idx) => (
                            <TableRow key={idx}>
                                <TableCell className="text-center text-muted-foreground">
                                    {idx + 1}
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

export default DataPreview;
