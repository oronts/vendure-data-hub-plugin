import {
    Card,
    Badge,
    ScrollArea,
} from '@vendure/dashboard';
import { FileText } from 'lucide-react';
import { LoadingState, EmptyState } from '../../shared/feedback';
import type { ParsedData } from '../../../types/wizard';
import { UI_LIMITS, COMPONENT_HEIGHTS } from '../../../constants';
import { STEP_CONTENT } from './constants';

interface PreviewStepProps {
    parsedData: ParsedData | null;
    isParsing: boolean;
}

export function PreviewStep({ parsedData, isParsing }: PreviewStepProps) {
    if (isParsing) {
        return <LoadingState type="spinner" message="Parsing file..." />;
    }

    if (!parsedData) {
        return (
            <EmptyState
                icon={<FileText className="h-12 w-12" />}
                title={STEP_CONTENT.preview.emptyTitle}
                description={STEP_CONTENT.preview.emptyDescription}
            />
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold mb-2">{STEP_CONTENT.preview.title}</h2>
                    <p className="text-muted-foreground">
                        Showing first {Math.min(parsedData.rows.length, UI_LIMITS.MAX_PREVIEW_ROWS)} of {parsedData.rows.length} records
                    </p>
                </div>
                <Badge variant="secondary">
                    {parsedData.headers.length} columns
                </Badge>
            </div>

            <Card>
                <ScrollArea className={COMPONENT_HEIGHTS.WIZARD_PANE_MD}>
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
                                {/* Index as key acceptable - static preview data, not reordered */}
                                {parsedData.rows.slice(0, UI_LIMITS.MAX_PREVIEW_ROWS).map((row, rowIndex) => (
                                    <tr key={`row-${rowIndex}`} className="border-t hover:bg-muted/50">
                                        <td className="px-4 py-2 text-muted-foreground">{rowIndex + 1}</td>
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
