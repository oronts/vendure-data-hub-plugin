/**
 * Import Wizard - Preview Step Component
 * Shows a preview of the parsed data
 */

import * as React from 'react';
import {
    Card,
    Badge,
    ScrollArea,
} from '@vendure/dashboard';
import {
    AlertCircle,
    Loader2,
} from 'lucide-react';
import type { ParsedData } from './types';

interface PreviewStepProps {
    parsedData: ParsedData | null;
    isParsing: boolean;
}

export function PreviewStep({ parsedData, isParsing }: PreviewStepProps) {
    if (isParsing) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!parsedData) {
        return (
            <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p>No data to preview. Please upload a file first.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold">Data Preview</h2>
                    <p className="text-muted-foreground">
                        Showing first {Math.min(parsedData.rows.length, 100)} of {parsedData.rows.length} records
                    </p>
                </div>
                <Badge variant="secondary">
                    {parsedData.headers.length} columns
                </Badge>
            </div>

            <Card>
                <ScrollArea className="h-[500px]">
                    <div className="min-w-max">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-muted">
                                <tr>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">#</th>
                                    {parsedData.headers.map(header => (
                                        <th key={header} className="px-4 py-2 text-left font-medium">
                                            {header}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {parsedData.rows.slice(0, 50).map((row, i) => (
                                    <tr key={i} className="border-t hover:bg-muted/50">
                                        <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                                        {parsedData.headers.map(header => (
                                            <td key={header} className="px-4 py-2 font-mono text-xs">
                                                {String(row[header] ?? '')}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ScrollArea>
            </Card>
        </div>
    );
}

export default PreviewStep;
