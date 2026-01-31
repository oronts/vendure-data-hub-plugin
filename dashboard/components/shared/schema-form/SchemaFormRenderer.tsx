import * as React from 'react';
import {
    Input,
    Label,
    Switch,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Textarea,
    Button,
} from '@vendure/dashboard';
import { Upload, CheckCircle2, X, RefreshCw } from 'lucide-react';
import type { AdapterSchema, AdapterSchemaField, SchemaFieldType, SchemaFormRendererProps } from '../../../types';
import { DEBOUNCE_DELAYS, DATAHUB_API_UPLOAD, DATAHUB_API_FILE_PREVIEW } from '../../../constants';
import { formatFileSize } from '../../../utils';

function evaluateDependency(
    dependsOn: AdapterSchemaField['dependsOn'] | undefined,
    values: Record<string, unknown>
): boolean {
    if (!dependsOn) return true;

    const fieldValue = values[dependsOn.field];
    const targetValue = dependsOn.value;
    const operator = dependsOn.operator ?? 'eq';

    switch (operator) {
        case 'eq':
            return fieldValue === targetValue;
        case 'ne':
            return fieldValue !== targetValue;
        case 'in':
            return Array.isArray(targetValue) && targetValue.includes(fieldValue);
        case 'exists':
            return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
        default:
            return true;
    }
}

function normalizeFieldType(type: SchemaFieldType): string {
    return type.toLowerCase();
}

interface FieldWrapperProps {
    field: AdapterSchemaField;
    compact?: boolean;
    error?: string;
    children: React.ReactNode;
}

function FieldWrapper({ field, compact, error, children }: FieldWrapperProps) {
    return (
        <div className={compact ? 'space-y-1' : 'space-y-2'}>
            <div className="flex items-center gap-1">
                <Label htmlFor={field.key} className={compact ? 'text-xs font-medium' : 'text-sm font-medium'}>
                    {field.label || field.key}
                    {field.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
            </div>
            {children}
            {field.description && !compact && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}

interface StringFieldProps {
    field: AdapterSchemaField;
    value: string;
    onChange: (value: string) => void;
    compact?: boolean;
    disabled?: boolean;
}

function StringField({ field, value, onChange, compact, disabled }: StringFieldProps) {
    const fieldType = normalizeFieldType(field.type);
    const inputType = fieldType === 'password' ? 'password' :
                      fieldType === 'email' ? 'email' :
                      fieldType === 'url' ? 'url' : 'text';

    return (
        <Input
            id={field.key}
            type={inputType}
            value={value ?? field.default ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            className={compact ? 'h-8 text-sm' : ''}
        />
    );
}

interface NumberFieldProps {
    field: AdapterSchemaField;
    value: number | undefined;
    onChange: (value: number | undefined) => void;
    compact?: boolean;
    disabled?: boolean;
}

function NumberField({ field, value, onChange, compact, disabled }: NumberFieldProps) {
    return (
        <Input
            id={field.key}
            type="number"
            value={value ?? field.default ?? ''}
            onChange={(e) => {
                const val = e.target.value;
                onChange(val === '' ? undefined : Number(val));
            }}
            placeholder={field.placeholder}
            disabled={disabled}
            min={field.validation?.min}
            max={field.validation?.max}
            className={compact ? 'h-8 text-sm' : ''}
        />
    );
}

interface BooleanFieldProps {
    field: AdapterSchemaField;
    value: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
}

function BooleanField({ field, value, onChange, disabled }: BooleanFieldProps) {
    return (
        <div className="flex items-center gap-2">
            <Switch
                id={field.key}
                checked={value ?? (field.default as boolean) ?? false}
                onCheckedChange={onChange}
                disabled={disabled}
            />
            {field.description && (
                <span className="text-xs text-muted-foreground">{field.description}</span>
            )}
        </div>
    );
}

interface SelectFieldProps {
    field: AdapterSchemaField;
    value: string;
    onChange: (value: string) => void;
    compact?: boolean;
    disabled?: boolean;
}

function SelectField({ field, value, onChange, compact, disabled }: SelectFieldProps) {
    return (
        <Select value={value ?? (field.default as string) ?? ''} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger className={compact ? 'h-8 text-sm' : ''}>
                <SelectValue placeholder={field.placeholder ?? `Select ${field.label || field.key}`} />
            </SelectTrigger>
            <SelectContent>
                {field.options?.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

interface ReferenceFieldProps {
    field: AdapterSchemaField;
    value: string;
    onChange: (value: string) => void;
    options: string[];
    placeholder: string;
    compact?: boolean;
    disabled?: boolean;
}

function ReferenceField({ field, value, onChange, options, placeholder, compact, disabled }: ReferenceFieldProps) {
    return (
        <Select value={value ?? ''} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger className={compact ? 'h-8 text-sm' : ''}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {options.length === 0 ? (
                    <SelectItem value="" disabled>
                        No options available
                    </SelectItem>
                ) : (
                    options.map((code) => (
                        <SelectItem key={code} value={code}>
                            {code}
                        </SelectItem>
                    ))
                )}
            </SelectContent>
        </Select>
    );
}

interface TextareaFieldProps {
    field: AdapterSchemaField;
    value: string;
    onChange: (value: string) => void;
    compact?: boolean;
    disabled?: boolean;
    isCode?: boolean;
}

function TextareaField({ field, value, onChange, compact, disabled, isCode = false }: TextareaFieldProps) {
    return (
        <Textarea
            id={field.key}
            value={value ?? field.default ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            rows={compact ? 2 : 5}
            className={isCode ? 'font-mono text-sm' : (compact ? 'text-sm' : '')}
        />
    );
}

interface FileUploadFieldProps {
    field: AdapterSchemaField;
    value: string | undefined;
    onChange: (value: string | undefined) => void;
    compact?: boolean;
    disabled?: boolean;
}

function FileUploadField({ field, value, onChange, compact, disabled }: FileUploadFieldProps) {
    const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
    const [uploading, setUploading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [uploadedFileName, setUploadedFileName] = React.useState<string | null>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleFileSelect = async (file: File) => {
        setSelectedFile(file);
        setError(null);
        setUploading(true);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const uploadResponse = await fetch(DATAHUB_API_UPLOAD, {
                method: 'POST',
                body: formData,
                credentials: 'include',
            });

            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json().catch(() => ({}));
                throw new Error(errorData.error || `Upload failed: ${uploadResponse.status}`);
            }

            const uploadResult = await uploadResponse.json();

            if (!uploadResult.success || !uploadResult.file) {
                throw new Error(uploadResult.error || 'Upload failed');
            }

            const fileId = uploadResult.file.id;
            setUploadedFileName(uploadResult.file.originalName || file.name);
            onChange(fileId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
            setSelectedFile(null);
        } finally {
            setUploading(false);
        }
    };

    const handleClear = () => {
        setSelectedFile(null);
        setUploadedFileName(null);
        setError(null);
        onChange(undefined);
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && !disabled) handleFileSelect(file);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelect(file);
    };

    const hasFile = !!value || !!uploadedFileName;
    const displayName = uploadedFileName || (value ? `File ID: ${value}` : null);
    const padding = compact ? 'p-3' : 'p-4';

    return (
        <div className="space-y-2">
            <div
                className={`border-2 border-dashed rounded-lg ${padding} text-center transition-colors ${
                    hasFile
                        ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                        : 'border-muted-foreground/25 hover:border-primary/50 cursor-pointer'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={handleDrop}
                onClick={() => !hasFile && !disabled && inputRef.current?.click()}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,.json,.xlsx,.xls,.xml"
                    onChange={handleChange}
                    className="hidden"
                    disabled={disabled}
                />

                {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                        <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                        <p className="text-sm">Uploading...</p>
                    </div>
                ) : hasFile ? (
                    <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="w-6 h-6 text-green-500" />
                        <p className="text-sm font-medium truncate max-w-full">{displayName}</p>
                        {selectedFile && (
                            <p className="text-xs text-muted-foreground">
                                {formatFileSize(selectedFile.size)}
                            </p>
                        )}
                        {!disabled && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="mt-1 h-7 text-xs"
                                onClick={(e) => { e.stopPropagation(); handleClear(); }}
                            >
                                <X className="w-3 h-3 mr-1" />
                                Remove
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2">
                        <Upload className="w-6 h-6 text-muted-foreground" />
                        <p className="text-sm">Drop file or click to browse</p>
                        <p className="text-xs text-muted-foreground">CSV, JSON, Excel, XML</p>
                    </div>
                )}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}

interface JsonFieldProps {
    field: AdapterSchemaField;
    value: unknown;
    onChange: (value: unknown) => void;
    compact?: boolean;
    disabled?: boolean;
}

function JsonField({ field, value, onChange, compact, disabled }: JsonFieldProps) {
    const [text, setText] = React.useState(() => {
        try {
            return value ? JSON.stringify(value, null, 2) : '';
        } catch {
            return '';
        }
    });
    const [error, setError] = React.useState<string | null>(null);
    const [isPending, setIsPending] = React.useState(false);
    const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = React.useRef(true);

    React.useEffect(() => {
        return () => {
            mountedRef.current = false;
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    React.useEffect(() => {
        try {
            const newText = value ? JSON.stringify(value, null, 2) : '';
            const currentParsed = text.trim() ? JSON.parse(text) : undefined;
            if (JSON.stringify(currentParsed) !== JSON.stringify(value)) {
                setText(newText);
                setError(null);
            }
        } catch {
            // JSON parse/stringify failed - keep existing text
        }
    }, [value]);

    const validateJson = React.useCallback((jsonText: string): string | null => {
        if (!jsonText.trim()) {
            return null;
        }
        try {
            JSON.parse(jsonText);
            return null;
        } catch (e) {
            const parseError = e as SyntaxError;
            let message = parseError.message
                .replace(/^JSON\.parse: /, '')
                .replace(/^SyntaxError: /, '');

            const posMatch = message.match(/at position (\d+)/i);
            if (posMatch) {
                const pos = parseInt(posMatch[1], 10);
                const lines = jsonText.substring(0, pos).split('\n');
                const line = lines.length;
                const col = lines[lines.length - 1].length + 1;
                message = message.replace(/ at position \d+/, '').replace(/ in JSON at position \d+/, '');
                return `Invalid JSON: ${message} (line ${line}, col ${col})`;
            }
            return `Invalid JSON: ${message}`;
        }
    }, []);

    const handleChange = (newText: string) => {
        setText(newText);
        setIsPending(true);

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            if (!mountedRef.current) return;

            setIsPending(false);
            const validationError = validateJson(newText);

            if (validationError) {
                setError(validationError);
            } else {
                setError(null);
                if (!newText.trim()) {
                    onChange(undefined);
                } else {
                    try {
                        onChange(JSON.parse(newText));
                    } catch {
                        // JSON parse failed - already handled by validation above
                    }
                }
            }
        }, DEBOUNCE_DELAYS.JSON_VALIDATION);
    };

    const getBorderClass = () => {
        if (disabled) return '';
        if (error) return 'border-destructive focus:border-destructive focus:ring-destructive/20';
        if (isPending) return 'border-amber-400';
        return '';
    };

    return (
        <div className="space-y-1">
            <Textarea
                id={field.key}
                value={text}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={field.placeholder ?? '{}'}
                disabled={disabled}
                rows={compact ? 3 : 6}
                className={`font-mono text-xs ${getBorderClass()}`}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}

export function SchemaFormRenderer({
    schema,
    values,
    onChange,
    errors = {},
    readOnly = false,
    hideOptional = false,
    secretCodes = [],
    connectionCodes = [],
    compact = false,
}: SchemaFormRendererProps) {
    const visibleFields = React.useMemo(() => {
        if (!schema?.fields) return [];
        return schema.fields.filter((field) => {
            if (field.hidden) {
                return false;
            }
            if (hideOptional && !field.required && !field.advanced) {
                return false;
            }
            if (!evaluateDependency(field.dependsOn, values)) {
                return false;
            }
            return true;
        });
    }, [schema?.fields, values, hideOptional]);

    const groupedFields = React.useMemo(() => {
        const groups: Record<string, AdapterSchemaField[]> = { _default: [] };

        for (const field of visibleFields) {
            const groupName = field.group || '_default';
            if (!groups[groupName]) {
                groups[groupName] = [];
            }
            groups[groupName].push(field);
        }

        return groups;
    }, [visibleFields]);

    const handleFieldChange = (key: string, value: unknown) => {
        onChange({ ...values, [key]: value });
    };

    const renderField = (field: AdapterSchemaField) => {
        const value = values[field.key];
        const error = errors[field.key];
        const fieldType = normalizeFieldType(field.type);

        switch (fieldType) {
            case 'string':
            case 'text':
            case 'password':
            case 'email':
            case 'url':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <StringField
                            field={field}
                            value={value as string}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            compact={compact}
                            disabled={readOnly}
                        />
                    </FieldWrapper>
                );

            case 'number':
            case 'int':
            case 'float':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <NumberField
                            field={field}
                            value={value as number | undefined}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            compact={compact}
                            disabled={readOnly}
                        />
                    </FieldWrapper>
                );

            case 'boolean':
                return (
                    <div key={field.key} className={compact ? 'py-1' : 'py-2'}>
                        <div className="flex items-center justify-between">
                            <Label htmlFor={field.key} className={compact ? 'text-xs font-medium' : 'text-sm font-medium'}>
                                {field.label || field.key}
                                {field.required && <span className="text-destructive ml-0.5">*</span>}
                            </Label>
                            <BooleanField
                                field={field}
                                value={value as boolean}
                                onChange={(v) => handleFieldChange(field.key, v)}
                                disabled={readOnly}
                            />
                        </div>
                        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
                    </div>
                );

            case 'select':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <SelectField
                            field={field}
                            value={value as string}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            compact={compact}
                            disabled={readOnly}
                        />
                    </FieldWrapper>
                );

            case 'secret':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <ReferenceField
                            field={field}
                            value={value as string}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            options={secretCodes}
                            placeholder="Select secret..."
                            compact={compact}
                            disabled={readOnly}
                        />
                    </FieldWrapper>
                );

            case 'connection':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <ReferenceField
                            field={field}
                            value={value as string}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            options={connectionCodes}
                            placeholder="Select connection..."
                            compact={compact}
                            disabled={readOnly}
                        />
                    </FieldWrapper>
                );

            case 'json':
            case 'object':
            case 'array':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <JsonField
                            field={field}
                            value={value}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            compact={compact}
                            disabled={readOnly}
                        />
                    </FieldWrapper>
                );

            case 'textarea':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <TextareaField
                            field={field}
                            value={value as string}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            compact={compact}
                            disabled={readOnly}
                        />
                    </FieldWrapper>
                );

            case 'code':
            case 'expression':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <TextareaField
                            field={field}
                            value={value as string}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            compact={compact}
                            disabled={readOnly}
                            isCode
                        />
                    </FieldWrapper>
                );

            case 'entity':
                // Entity fields should render as select if they have options
                if (field.options && field.options.length > 0) {
                    return (
                        <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                            <SelectField
                                field={field}
                                value={value as string}
                                onChange={(v) => handleFieldChange(field.key, v)}
                                compact={compact}
                                disabled={readOnly}
                            />
                        </FieldWrapper>
                    );
                }
                // Fall through to string if no options
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <StringField
                            field={field}
                            value={String(value ?? field.default ?? '')}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            compact={compact}
                            disabled={readOnly}
                        />
                    </FieldWrapper>
                );

            case 'file':
            case 'fileupload':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <FileUploadField
                            field={field}
                            value={value as string | undefined}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            compact={compact}
                            disabled={readOnly}
                        />
                    </FieldWrapper>
                );

            case 'cron':
            case 'date':
            case 'datetime':
            case 'field':
            case 'mapping':
            case 'multiselect':
            default:
                // Check if field has options - render as select if so
                if (field.options && field.options.length > 0) {
                    return (
                        <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                            <SelectField
                                field={field}
                                value={value as string}
                                onChange={(v) => handleFieldChange(field.key, v)}
                                compact={compact}
                                disabled={readOnly}
                            />
                        </FieldWrapper>
                    );
                }
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <StringField
                            field={field}
                            value={String(value ?? field.default ?? '')}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            compact={compact}
                            disabled={readOnly}
                        />
                    </FieldWrapper>
                );
        }
    };

    return (
        <div className={compact ? 'space-y-2' : 'space-y-4'}>
            {Object.entries(groupedFields).map(([groupName, fields]) => (
                <div key={groupName} className={compact ? 'space-y-2' : 'space-y-4'}>
                    {groupName !== '_default' && (
                        <h4 className="text-sm font-medium text-muted-foreground border-b pb-2 capitalize">
                            {groupName.replace(/-/g, ' ')}
                        </h4>
                    )}
                    <div className={groupName !== '_default' ? 'pl-2 border-l-2 space-y-3' : ''}>
                        {fields.map(renderField)}
                    </div>
                </div>
            ))}
        </div>
    );
}
