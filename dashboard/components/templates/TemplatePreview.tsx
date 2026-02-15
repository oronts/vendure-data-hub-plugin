/**
 * Template Preview Component
 *
 * Shows detailed information about a selected template including
 * required fields, sample data, and configuration preview.
 */

import * as React from 'react';
import { memo } from 'react';
import {
    FileText,
    CheckCircle,
    Circle,
    Clock,
    Tag,
    Download,
    Copy,
    ChevronDown,
    ChevronRight,
} from 'lucide-react';
import { Badge, Button } from '@vendure/dashboard';
import { toast } from 'sonner';
import { TOAST_TEMPLATE } from '../../constants/ToastMessages';

type TemplateDifficulty = 'beginner' | 'intermediate' | 'advanced';

interface ImportTemplate {
    id: string;
    name: string;
    description: string;
    category: string;
    icon?: string;
    difficulty: TemplateDifficulty;
    estimatedTime: string;
    requiredFields: string[];
    optionalFields: string[];
    sampleData?: Record<string, unknown>[];
    tags?: string[];
    formats?: string[];
}

export interface TemplatePreviewProps {
    template: ImportTemplate;
    onUseTemplate: () => void;
}

const DIFFICULTY_LABELS: Record<TemplateDifficulty, string> = {
    beginner: 'Beginner Friendly',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
};

const DIFFICULTY_STYLES: Record<TemplateDifficulty, string> = {
    beginner: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    intermediate: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    advanced: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function TemplatePreviewComponent({ template, onUseTemplate }: TemplatePreviewProps) {
    const [showSampleData, setShowSampleData] = React.useState(false);

    const handleCopySampleData = React.useCallback(() => {
        if (template.sampleData) {
            const csvHeader = [...template.requiredFields, ...template.optionalFields].join(',');
            const csvRows = template.sampleData.map(row =>
                [...template.requiredFields, ...template.optionalFields]
                    .map(field => row[field] ?? '')
                    .join(','),
            );
            const csv = [csvHeader, ...csvRows].join('\n');
            navigator.clipboard.writeText(csv).catch(() => {
                console.warn('Clipboard API not available');
            });
            toast.success(TOAST_TEMPLATE.SAMPLE_COPIED);
        }
    }, [template]);

    const handleDownloadSample = React.useCallback(() => {
        if (template.sampleData) {
            const csvHeader = [...template.requiredFields, ...template.optionalFields].join(',');
            const csvRows = template.sampleData.map(row =>
                [...template.requiredFields, ...template.optionalFields]
                    .map(field => {
                        const value = row[field] ?? '';
                        // Escape commas and quotes in CSV
                        const strValue = String(value);
                        if (strValue.includes(',') || strValue.includes('"')) {
                            return `"${strValue.replace(/"/g, '""')}"`;
                        }
                        return strValue;
                    })
                    .join(','),
            );
            const csv = [csvHeader, ...csvRows].join('\n');

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${template.id}-sample.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success(TOAST_TEMPLATE.SAMPLE_DOWNLOADED);
        }
    }, [template]);

    return (
        <div className="border rounded-lg bg-card">
            {/* Header */}
            <div className="p-4 border-b">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-lg font-semibold">{template.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                    </div>
                    <Button onClick={onUseTemplate}>
                        Use Template
                    </Button>
                </div>

                {/* Meta badges */}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${DIFFICULTY_STYLES[template.difficulty]}`}>
                        {DIFFICULTY_LABELS[template.difficulty]}
                    </span>
                    <span className="inline-flex items-center text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 mr-1" />
                        {template.estimatedTime}
                    </span>
                    {template.formats?.map(format => (
                        <Badge key={format} variant="outline" className="text-xs">
                            {format.toUpperCase()}
                        </Badge>
                    ))}
                </div>

                {/* Tags */}
                {template.tags && template.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-3">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        {template.tags.map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>

            {/* Required Fields */}
            <div className="p-4 border-b">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Required Fields
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {template.requiredFields.map(field => (
                        <div
                            key={field}
                            className="flex items-center gap-2 text-sm"
                        >
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{field}</code>
                        </div>
                    ))}
                </div>
            </div>

            {/* Optional Fields */}
            {template.optionalFields.length > 0 && (
                <div className="p-4 border-b">
                    <h4 className="text-sm font-medium mb-3">Optional Fields</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {template.optionalFields.map(field => (
                            <div
                                key={field}
                                className="flex items-center gap-2 text-sm"
                            >
                                <Circle className="h-4 w-4 text-muted-foreground" />
                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{field}</code>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Sample Data */}
            {template.sampleData && template.sampleData.length > 0 && (
                <div className="p-4">
                    <button
                        type="button"
                        onClick={() => setShowSampleData(!showSampleData)}
                        className="flex items-center gap-2 text-sm font-medium w-full text-left"
                    >
                        {showSampleData ? (
                            <ChevronDown className="h-4 w-4" />
                        ) : (
                            <ChevronRight className="h-4 w-4" />
                        )}
                        Sample Data ({template.sampleData.length} rows)
                    </button>

                    {showSampleData && (
                        <div className="mt-3">
                            <div className="flex justify-end gap-2 mb-2">
                                <Button variant="ghost" size="sm" onClick={handleCopySampleData}>
                                    <Copy className="h-3.5 w-3.5 mr-1" />
                                    Copy CSV
                                </Button>
                                <Button variant="ghost" size="sm" onClick={handleDownloadSample}>
                                    <Download className="h-3.5 w-3.5 mr-1" />
                                    Download
                                </Button>
                            </div>
                            <div className="overflow-x-auto border rounded">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted">
                                        <tr>
                                            {[...template.requiredFields, ...template.optionalFields].map(field => (
                                                <th key={field} className="px-3 py-2 text-left font-medium">
                                                    {field}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {template.sampleData.map((row, idx) => (
                                            <tr key={idx} className="border-t">
                                                {[...template.requiredFields, ...template.optionalFields].map(field => (
                                                    <td key={field} className="px-3 py-2">
                                                        {String(row[field] ?? '')}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export const TemplatePreview = memo(TemplatePreviewComponent);
