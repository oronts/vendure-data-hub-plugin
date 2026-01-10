import * as React from 'react';
import {
    Button,
    Card,
    CardContent,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import {
    ArrowRight,
    Check,
    RefreshCw,
    FileSpreadsheet,
    HelpCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { FileUploadZone } from './FileUploadZone';
import { DataPreview } from './DataPreview';
import { FieldMappingEditor } from './FieldMappingEditor';
import { ColumnStats } from './ColumnStats';
import { StepIndicator } from './StepIndicator';
import { parseCSV, analyzeColumns, autoMap, getFileType } from './helpers';
import type { FileUploadMapperProps, ParsedFile, FieldMapping } from './types';

export function FileUploadMapper({
    targetSchema = [],
    onMappingComplete,
    onCancel,
    allowedTypes = ['csv', 'excel', 'json'],
}: FileUploadMapperProps) {
    const [step, setStep] = React.useState<'upload' | 'preview' | 'mapping'>('upload');
    const [loading, setLoading] = React.useState(false);
    const [parsedFile, setParsedFile] = React.useState<ParsedFile | null>(null);
    const [mappings, setMappings] = React.useState<FieldMapping[]>([]);
    const [csvDelimiter, setCsvDelimiter] = React.useState(',');

    const handleFileSelect = async (file: File) => {
        setLoading(true);
        try {
            const fileType = getFileType(file.name);
            if (!fileType || !allowedTypes.includes(fileType)) {
                toast.error('Unsupported file type');
                return;
            }

            let data: Record<string, any>[] = [];

            if (fileType === 'csv') {
                const content = await file.text();
                data = parseCSV(content, csvDelimiter);
            } else if (fileType === 'json') {
                const content = await file.text();
                const parsed = JSON.parse(content);
                data = Array.isArray(parsed) ? parsed : [parsed];
            } else if (fileType === 'excel') {
                toast.error('Excel parsing requires xlsx library. Please use CSV or JSON.');
                return;
            }

            if (data.length === 0) {
                toast.error('No data found in file');
                return;
            }

            const columns = analyzeColumns(data);

            setParsedFile({
                fileName: file.name,
                fileType,
                rowCount: data.length,
                columns,
                preview: data.slice(0, 10),
                rawData: data,
            });

            if (targetSchema.length > 0) {
                const autoMappings = autoMap(columns, targetSchema);
                setMappings(autoMappings);
            }

            setStep('preview');
            toast.success(`Parsed ${data.length.toLocaleString()} rows with ${columns.length} columns`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error occurred';
            toast.error(`Failed to parse file: ${message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleComplete = () => {
        if (!parsedFile) return;

        const missingRequired = targetSchema.filter(
            f => f.required && !mappings.some(m => m.targetField === f.name && m.sourceField)
        );

        if (missingRequired.length > 0) {
            toast.error(`Missing required fields: ${missingRequired.map(f => f.name).join(', ')}`);
            return;
        }

        const transformedData = parsedFile.rawData.map(row => {
            const newRow: Record<string, any> = {};
            for (const mapping of mappings) {
                if (mapping.sourceField) {
                    newRow[mapping.targetField] = row[mapping.sourceField] ?? mapping.defaultValue;
                } else if (mapping.defaultValue !== undefined) {
                    newRow[mapping.targetField] = mapping.defaultValue;
                }
            }
            return newRow;
        });

        onMappingComplete(mappings, transformedData);
    };

    return (
        <div className="space-y-6">
            {/* Step indicator */}
            <div className="flex items-center gap-4">
                <StepIndicator number={1} label="Upload" active={step === 'upload'} completed={step !== 'upload'} />
                <div className="flex-1 h-px bg-border" />
                <StepIndicator number={2} label="Preview" active={step === 'preview'} completed={step === 'mapping'} />
                <div className="flex-1 h-px bg-border" />
                <StepIndicator number={3} label="Map Fields" active={step === 'mapping'} completed={false} />
            </div>

            {/* Step content */}
            {step === 'upload' && (
                <div className="space-y-4">
                    {allowedTypes.includes('csv') && (
                        <div className="flex items-center gap-4">
                            <Label>CSV Delimiter:</Label>
                            <Select value={csvDelimiter} onValueChange={setCsvDelimiter}>
                                <SelectTrigger className="w-32">
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
                    )}
                    <FileUploadZone
                        onFileSelect={handleFileSelect}
                        allowedTypes={allowedTypes}
                        loading={loading}
                    />
                </div>
            )}

            {step === 'preview' && parsedFile && (
                <div className="space-y-6">
                    {/* File info */}
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <FileSpreadsheet className="w-10 h-10 text-green-500" />
                                    <div>
                                        <p className="font-medium">{parsedFile.fileName}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {parsedFile.rowCount.toLocaleString()} rows - {parsedFile.columns.length} columns
                                        </p>
                                    </div>
                                </div>
                                <Button variant="outline" onClick={() => { setStep('upload'); setParsedFile(null); }}>
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Upload Different File
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Column stats */}
                    <div>
                        <h3 className="text-lg font-medium mb-4">Column Analysis</h3>
                        <ColumnStats columns={parsedFile.columns} rowCount={parsedFile.rowCount} />
                    </div>

                    {/* Data preview */}
                    <div>
                        <h3 className="text-lg font-medium mb-4">Data Preview</h3>
                        <DataPreview data={parsedFile.preview} columns={parsedFile.columns} />
                    </div>

                    {/* Actions */}
                    <div className="flex justify-between">
                        <Button variant="outline" onClick={() => { setStep('upload'); setParsedFile(null); }}>
                            Back
                        </Button>
                        <Button onClick={() => setStep('mapping')}>
                            Continue to Mapping
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </div>
            )}

            {step === 'mapping' && parsedFile && (
                <div className="space-y-6">
                    {targetSchema.length > 0 ? (
                        <FieldMappingEditor
                            sourceColumns={parsedFile.columns}
                            targetSchema={targetSchema}
                            mappings={mappings}
                            onChange={setMappings}
                        />
                    ) : (
                        <Card>
                            <CardContent className="p-6 text-center">
                                <HelpCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                                <p className="text-lg font-medium mb-2">No Target Schema Selected</p>
                                <p className="text-sm text-muted-foreground">
                                    Select a target schema or proceed with the data as-is.
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Actions */}
                    <div className="flex justify-between">
                        <Button variant="outline" onClick={() => setStep('preview')}>
                            Back
                        </Button>
                        <div className="flex gap-2">
                            {onCancel && (
                                <Button variant="outline" onClick={onCancel}>
                                    Cancel
                                </Button>
                            )}
                            <Button onClick={handleComplete}>
                                <Check className="w-4 h-4 mr-2" />
                                Complete Mapping
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default FileUploadMapper;
