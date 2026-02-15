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

import { FileDropzone } from '../../shared/file-dropzone';
import { DataPreview } from './DataPreview';
import { FieldMappingEditor } from './FieldMappingEditor';
import { ColumnStats } from './ColumnStats';
import { StepIndicator } from './StepIndicator';
import { parseCSV, analyzeColumns, getFileType, computeAutoMappings } from '../../../utils';
import { UI_LIMITS } from '../../../constants/ui-config';
import { FILE_FORMAT } from '../../../constants/wizard-options';
import { MAPPER_STEP } from '../../../constants/ui-types';
import { TOAST_FILE, formatParsedRowsColumns, formatMissingRequired } from '../../../constants/toast-messages';
import { getErrorMessage } from '../../../../shared';
import type { FileUploadMapperProps, ParsedFile, UIFieldMapping } from './types';

export function FileUploadMapper({
    targetSchema = [],
    onMappingComplete,
    onCancel,
    allowedTypes = [FILE_FORMAT.CSV, FILE_FORMAT.XLSX, FILE_FORMAT.JSON],
}: FileUploadMapperProps) {
    const [step, setStep] = React.useState<typeof MAPPER_STEP[keyof typeof MAPPER_STEP]>(MAPPER_STEP.UPLOAD);
    const [loading, setLoading] = React.useState(false);
    const [parsedFile, setParsedFile] = React.useState<ParsedFile | null>(null);
    const [mappings, setMappings] = React.useState<UIFieldMapping[]>([]);
    const [csvDelimiter, setCsvDelimiter] = React.useState(',');

    // Memoize auto-mapping computation based on parsed columns and target schema
    const computeInitialMappings = React.useCallback((columns: { name: string }[]) => {
        if (targetSchema.length === 0) return [];
        const sourceNames = columns.map(c => c.name);
        const targetNames = targetSchema.map(t => t.name);
        const requiredFields = targetSchema.filter(t => t.required).map(t => t.name);
        const results = computeAutoMappings(sourceNames, targetNames, {
            includeDots: false,
            includeUnmatchedRequired: true,
            requiredFields,
        });
        return results.map(r => ({ sourceField: r.sourceField, targetField: r.targetField }));
    }, [targetSchema]);

    const handleFileSelect = React.useCallback(async (file: File) => {
        setLoading(true);
        try {
            const fileType = getFileType(file.name);
            if (!fileType || !allowedTypes.includes(fileType)) {
                toast.error(TOAST_FILE.UNSUPPORTED_TYPE);
                return;
            }

            let data: Record<string, unknown>[] = [];

            if (fileType === FILE_FORMAT.CSV) {
                const content = await file.text();
                data = parseCSV(content, { delimiter: csvDelimiter });
            } else if (fileType === FILE_FORMAT.JSON) {
                const content = await file.text();
                const parsed = JSON.parse(content);
                data = Array.isArray(parsed) ? parsed : [parsed];
            } else if (fileType === FILE_FORMAT.XLSX) {
                toast.error(TOAST_FILE.EXCEL_REQUIRES_XLSX);
                return;
            }

            if (data.length === 0) {
                toast.error(TOAST_FILE.NO_DATA_FOUND);
                return;
            }

            const columns = analyzeColumns(data);

            setParsedFile({
                fileName: file.name,
                fileType,
                rowCount: data.length,
                columns,
                preview: data.slice(0, UI_LIMITS.PREVIEW_ROW_LIMIT),
                rawData: data,
            });

            const initialMappings = computeInitialMappings(columns);
            if (initialMappings.length > 0) {
                setMappings(initialMappings);
            }

            setStep(MAPPER_STEP.PREVIEW);
            toast.success(formatParsedRowsColumns(data.length, columns.length));
        } catch (error) {
            const message = getErrorMessage(error);
            toast.error(TOAST_FILE.PARSE_ERROR, { description: message });
        } finally {
            setLoading(false);
        }
    }, [allowedTypes, csvDelimiter, computeInitialMappings]);

    const handleReset = React.useCallback(() => {
        setStep(MAPPER_STEP.UPLOAD);
        setParsedFile(null);
    }, []);

    const handleContinueToMapping = React.useCallback(() => {
        setStep(MAPPER_STEP.MAPPING);
    }, []);

    const handleBackToPreview = React.useCallback(() => {
        setStep(MAPPER_STEP.PREVIEW);
    }, []);

    const handleComplete = React.useCallback(() => {
        if (!parsedFile) return;

        const missingRequired = targetSchema.filter(
            f => f.required && !mappings.some(m => m.targetField === f.name && m.sourceField)
        );

        if (missingRequired.length > 0) {
            toast.error(formatMissingRequired(missingRequired.map(f => f.name)));
            return;
        }

        const transformedData = parsedFile.rawData.map(row => {
            const newRow: Record<string, unknown> = {};
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
    }, [parsedFile, targetSchema, mappings, onMappingComplete]);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4" data-testid="datahub-file-upload-step-indicators">
                <StepIndicator number={1} label="Upload" active={step === MAPPER_STEP.UPLOAD} completed={step !== MAPPER_STEP.UPLOAD} data-testid="datahub-file-upload-step-1" />
                <div className="flex-1 h-px bg-border" />
                <StepIndicator number={2} label="Preview" active={step === MAPPER_STEP.PREVIEW} completed={step === MAPPER_STEP.MAPPING} data-testid="datahub-file-upload-step-2" />
                <div className="flex-1 h-px bg-border" />
                <StepIndicator number={3} label="Map Fields" active={step === MAPPER_STEP.MAPPING} completed={false} data-testid="datahub-file-upload-step-3" />
            </div>

            {step === MAPPER_STEP.UPLOAD && (
                <div className="space-y-4">
                    {allowedTypes.includes(FILE_FORMAT.CSV) && (
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
                    <FileDropzone
                        onFileSelect={handleFileSelect}
                        allowedTypes={allowedTypes}
                        loading={loading}
                    />
                </div>
            )}

            {step === MAPPER_STEP.PREVIEW && parsedFile && (
                <div className="space-y-6">
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
                                <Button variant="outline" onClick={handleReset}>
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Upload Different File
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div>
                        <h3 className="text-lg font-medium mb-4">Column Analysis</h3>
                        <ColumnStats columns={parsedFile.columns} rowCount={parsedFile.rowCount} />
                    </div>

                    <div>
                        <h3 className="text-lg font-medium mb-4">Data Preview</h3>
                        <DataPreview data={parsedFile.preview} columns={parsedFile.columns} />
                    </div>

                    <div className="flex justify-between">
                        <Button variant="outline" onClick={handleReset} data-testid="datahub-file-upload-back-button">
                            Back
                        </Button>
                        <Button onClick={handleContinueToMapping} data-testid="datahub-file-upload-continue-button">
                            Continue to Mapping
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </div>
            )}

            {step === MAPPER_STEP.MAPPING && parsedFile && (
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

                    <div className="flex justify-between">
                        <Button variant="outline" onClick={handleBackToPreview} data-testid="datahub-file-upload-mapping-back-button">
                            Back
                        </Button>
                        <div className="flex gap-2">
                            {onCancel && (
                                <Button variant="outline" onClick={onCancel} data-testid="datahub-file-upload-cancel-button">
                                    Cancel
                                </Button>
                            )}
                            <Button onClick={handleComplete} data-testid="datahub-file-upload-complete-button">
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
