/**
 * Export Wizard - Format Step Component
 * Handles output format selection and configuration
 */

import * as React from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
} from '@vendure/dashboard';
import { FEED_TEMPLATES } from './constants';
import type { ExportConfiguration, FormatType } from './types';

interface FormatStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

export function FormatStep({ config, updateConfig }: FormatStepProps) {
    const format = config.format ?? { type: 'csv', options: {} };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 className="text-2xl font-semibold mb-2">Output Format</h2>
                <p className="text-muted-foreground">
                    Choose the output format and configure options
                </p>
            </div>

            {/* Format Templates */}
            <FormatTemplateSelection format={format} updateConfig={updateConfig} />

            {/* Format Options */}
            <FormatOptionsCard format={format} updateConfig={updateConfig} />
        </div>
    );
}

interface FormatTemplateSelectionProps {
    format: ExportConfiguration['format'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function FormatTemplateSelection({ format, updateConfig }: FormatTemplateSelectionProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {FEED_TEMPLATES.map(template => {
                const Icon = template.icon;
                const isSelected = format.type === template.id ||
                    (template.id.startsWith('custom-') && format.type === template.format);

                return (
                    <button
                        key={template.id}
                        className={`p-4 border rounded-lg text-left transition-all ${
                            isSelected
                                ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                : 'hover:border-primary/50'
                        }`}
                        onClick={() => updateConfig({
                            format: {
                                type: template.id as FormatType,
                                options: {
                                    ...format.options,
                                    feedTemplate: template.id.startsWith('custom-') ? undefined : template.id,
                                },
                            },
                        })}
                    >
                        <Icon className={`w-8 h-8 mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div className="font-medium">{template.name}</div>
                        <div className="text-xs text-muted-foreground">{template.description}</div>
                    </button>
                );
            })}
        </div>
    );
}

interface FormatOptionsCardProps {
    format: ExportConfiguration['format'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function FormatOptionsCard({ format, updateConfig }: FormatOptionsCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Format Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {(format.type === 'csv' || format.type === 'meta-catalog') && (
                    <CsvOptions format={format} updateConfig={updateConfig} />
                )}

                {format.type === 'json' && (
                    <JsonOptions format={format} updateConfig={updateConfig} />
                )}

                {(format.type === 'xml' || format.type === 'google-merchant' || format.type === 'amazon-feed') && (
                    <XmlOptions format={format} updateConfig={updateConfig} />
                )}
            </CardContent>
        </Card>
    );
}

interface OptionsProps {
    format: ExportConfiguration['format'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function CsvOptions({ format, updateConfig }: OptionsProps) {
    return (
        <div className="grid grid-cols-2 gap-4">
            <div>
                <Label>Delimiter</Label>
                <Select
                    value={format.options.delimiter ?? ','}
                    onValueChange={delimiter => updateConfig({
                        format: { ...format, options: { ...format.options, delimiter } },
                    })}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value=",">Comma (,)</SelectItem>
                        <SelectItem value=";">Semicolon (;)</SelectItem>
                        <SelectItem value="\t">Tab</SelectItem>
                        <SelectItem value="|">Pipe (|)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div>
                <Label>Encoding</Label>
                <Select
                    value={format.options.encoding ?? 'utf-8'}
                    onValueChange={encoding => updateConfig({
                        format: { ...format, options: { ...format.options, encoding } },
                    })}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="utf-8">UTF-8</SelectItem>
                        <SelectItem value="utf-16">UTF-16</SelectItem>
                        <SelectItem value="iso-8859-1">ISO-8859-1</SelectItem>
                        <SelectItem value="windows-1252">Windows-1252</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="flex items-center gap-3">
                <Switch
                    checked={format.options.includeHeaders ?? true}
                    onCheckedChange={includeHeaders => updateConfig({
                        format: { ...format, options: { ...format.options, includeHeaders } },
                    })}
                />
                <Label>Include header row</Label>
            </div>

            <div className="flex items-center gap-3">
                <Switch
                    checked={format.options.quoteAll ?? false}
                    onCheckedChange={quoteAll => updateConfig({
                        format: { ...format, options: { ...format.options, quoteAll } },
                    })}
                />
                <Label>Quote all fields</Label>
            </div>
        </div>
    );
}

function JsonOptions({ format, updateConfig }: OptionsProps) {
    return (
        <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
                <Switch
                    checked={format.options.pretty ?? true}
                    onCheckedChange={pretty => updateConfig({
                        format: { ...format, options: { ...format.options, pretty } },
                    })}
                />
                <Label>Pretty print (formatted)</Label>
            </div>

            <div>
                <Label>Root Element</Label>
                <Input
                    value={format.options.rootElement ?? ''}
                    onChange={e => updateConfig({
                        format: { ...format, options: { ...format.options, rootElement: e.target.value } },
                    })}
                    placeholder="data"
                />
            </div>
        </div>
    );
}

function XmlOptions({ format, updateConfig }: OptionsProps) {
    return (
        <div className="grid grid-cols-2 gap-4">
            <div>
                <Label>Root Element</Label>
                <Input
                    value={format.options.xmlRoot ?? 'feed'}
                    onChange={e => updateConfig({
                        format: { ...format, options: { ...format.options, xmlRoot: e.target.value } },
                    })}
                />
            </div>

            <div>
                <Label>Item Element</Label>
                <Input
                    value={format.options.xmlItem ?? 'item'}
                    onChange={e => updateConfig({
                        format: { ...format, options: { ...format.options, xmlItem: e.target.value } },
                    })}
                />
            </div>
        </div>
    );
}

export default FormatStep;
