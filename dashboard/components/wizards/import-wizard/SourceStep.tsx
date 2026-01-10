/**
 * Import Wizard - Source Step Component
 * Handles data source selection and configuration
 */

import * as React from 'react';
import {
    Button,
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
    Textarea,
} from '@vendure/dashboard';
import { AlertCircle } from 'lucide-react';
import {
    Upload,
    FileSpreadsheet,
    Database,
    Globe,
    Webhook,
    Play,
    CheckCircle2,
    Loader2,
    FileJson,
    FileText,
} from 'lucide-react';
import type { ImportConfiguration, SourceConfig, TriggerConfig } from './types';

/** Source type for import configuration */
type SourceType = SourceConfig['type'];

/** File format type */
type FileFormat = NonNullable<SourceConfig['fileConfig']>['format'];

/** API method type */
type ApiMethod = NonNullable<SourceConfig['apiConfig']>['method'];

interface SourceStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    uploadedFile: File | null;
    setUploadedFile: (file: File | null) => void;
    isParsing: boolean;
}

const SOURCE_TYPES = [
    { id: 'file', label: 'File Upload', icon: Upload, description: 'CSV, Excel, JSON, XML' },
    { id: 'api', label: 'REST API', icon: Globe, description: 'Fetch from HTTP endpoint' },
    { id: 'database', label: 'Database', icon: Database, description: 'Query external database' },
    { id: 'webhook', label: 'Webhook', icon: Webhook, description: 'Receive push data' },
];

const FILE_FORMATS = [
    { id: 'csv', label: 'CSV', icon: FileSpreadsheet },
    { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet },
    { id: 'json', label: 'JSON', icon: FileJson },
    { id: 'xml', label: 'XML', icon: FileText },
];

export function SourceStep({
    config,
    updateConfig,
    uploadedFile,
    setUploadedFile,
    isParsing,
}: SourceStepProps) {
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 className="text-2xl font-semibold mb-2">Select Data Source</h2>
                <p className="text-muted-foreground">
                    Choose where your data will come from
                </p>
            </div>

            {/* Source Type Selection */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {SOURCE_TYPES.map(type => {
                    const Icon = type.icon;
                    const isSelected = config.source?.type === type.id;

                    return (
                        <button
                            key={type.id}
                            className={`p-4 border rounded-lg text-left transition-all ${
                                isSelected
                                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                    : 'hover:border-primary/50'
                            }`}
                            onClick={() => updateConfig({
                                source: { type: type.id as SourceType },
                            })}
                        >
                            <Icon className={`w-8 h-8 mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                            <div className="font-medium">{type.label}</div>
                            <div className="text-sm text-muted-foreground">{type.description}</div>
                        </button>
                    );
                })}
            </div>

            {/* File Upload Configuration */}
            {config.source?.type === 'file' && (
                <FileUploadConfig
                    config={config}
                    updateConfig={updateConfig}
                    uploadedFile={uploadedFile}
                    setUploadedFile={setUploadedFile}
                    isParsing={isParsing}
                    fileInputRef={fileInputRef}
                />
            )}

            {/* API Configuration */}
            {config.source?.type === 'api' && (
                <ApiConfig config={config} updateConfig={updateConfig} />
            )}
        </div>
    );
}

interface FileUploadConfigProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    uploadedFile: File | null;
    setUploadedFile: (file: File | null) => void;
    isParsing: boolean;
    fileInputRef: React.RefObject<HTMLInputElement>;
}

function FileUploadConfig({
    config,
    updateConfig,
    uploadedFile,
    setUploadedFile,
    isParsing,
    fileInputRef,
}: FileUploadConfigProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>File Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Format Selection */}
                <div>
                    <Label className="mb-2 block">File Format</Label>
                    <div className="flex gap-2">
                        {FILE_FORMATS.map(format => {
                            const Icon = format.icon;
                            const isSelected = config.source?.fileConfig?.format === format.id;

                            return (
                                <Button
                                    key={format.id}
                                    variant={isSelected ? 'default' : 'outline'}
                                    onClick={() => updateConfig({
                                        source: {
                                            ...config.source!,
                                            fileConfig: {
                                                ...config.source?.fileConfig,
                                                format: format.id as FileFormat,
                                                hasHeaders: true,
                                            },
                                        },
                                    })}
                                >
                                    <Icon className="w-4 h-4 mr-2" />
                                    {format.label}
                                </Button>
                            );
                        })}
                    </div>
                </div>

                {/* CSV Options */}
                {config.source?.fileConfig?.format === 'csv' && (
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Delimiter</Label>
                            <Select
                                value={config.source.fileConfig.delimiter ?? ','}
                                onValueChange={delimiter => updateConfig({
                                    source: {
                                        ...config.source!,
                                        fileConfig: { ...config.source?.fileConfig!, delimiter },
                                    },
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
                        <div className="flex items-center gap-3">
                            <Switch
                                checked={config.source.fileConfig.hasHeaders ?? true}
                                onCheckedChange={hasHeaders => updateConfig({
                                    source: {
                                        ...config.source!,
                                        fileConfig: { ...config.source?.fileConfig!, hasHeaders },
                                    },
                                })}
                            />
                            <Label>First row contains headers</Label>
                        </div>
                    </div>
                )}

                {/* File Upload */}
                <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                        uploadedFile ? 'border-green-500 bg-green-50' : 'border-muted hover:border-primary'
                    }`}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file) setUploadedFile(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".csv,.xlsx,.xls,.json,.xml"
                        onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) setUploadedFile(file);
                        }}
                    />

                    {isParsing ? (
                        <>
                            <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
                            <p className="font-medium">Parsing file...</p>
                        </>
                    ) : uploadedFile ? (
                        <>
                            <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
                            <p className="font-medium">{uploadedFile.name}</p>
                            <p className="text-sm text-muted-foreground">
                                {(uploadedFile.size / 1024).toFixed(1)} KB
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                className="mt-4"
                                onClick={e => {
                                    e.stopPropagation();
                                    setUploadedFile(null);
                                }}
                            >
                                Remove
                            </Button>
                        </>
                    ) : (
                        <>
                            <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                            <p className="font-medium">Drop your file here or click to browse</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Supports CSV, Excel, JSON, and XML files
                            </p>
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

interface ApiConfigProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

function ApiConfig({ config, updateConfig }: ApiConfigProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>API Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-4">
                    <div>
                        <Label>Method</Label>
                        <Select
                            value={config.source?.apiConfig?.method ?? 'GET'}
                            onValueChange={method => updateConfig({
                                source: {
                                    ...config.source!,
                                    apiConfig: { ...config.source?.apiConfig, method: method as ApiMethod, url: config.source?.apiConfig?.url ?? '' },
                                },
                            })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="GET">GET</SelectItem>
                                <SelectItem value="POST">POST</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="col-span-3">
                        <Label>URL</Label>
                        <Input
                            value={config.source?.apiConfig?.url ?? ''}
                            onChange={e => updateConfig({
                                source: {
                                    ...config.source!,
                                    apiConfig: { ...config.source?.apiConfig, url: e.target.value, method: config.source?.apiConfig?.method ?? 'GET' },
                                },
                            })}
                            placeholder="https://api.example.com/data"
                        />
                    </div>
                </div>

                <JsonHeadersField
                    value={config.source?.apiConfig?.headers ?? {}}
                    onChange={(headers) => updateConfig({
                        source: {
                            ...config.source!,
                            apiConfig: { ...config.source?.apiConfig!, headers },
                        },
                    })}
                />

                <Button variant="outline">
                    <Play className="w-4 h-4 mr-2" />
                    Test Connection
                </Button>
            </CardContent>
        </Card>
    );
}

/**
 * JSON Headers Field with debounced validation
 */
interface JsonHeadersFieldProps {
    value: Record<string, string>;
    onChange: (headers: Record<string, string>) => void;
}

function JsonHeadersField({ value, onChange }: JsonHeadersFieldProps) {
    const [text, setText] = React.useState(() => JSON.stringify(value ?? {}, null, 2));
    const [error, setError] = React.useState<string | null>(null);
    const [isPending, setIsPending] = React.useState(false);
    const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = React.useRef(true);

    React.useEffect(() => {
        return () => {
            mountedRef.current = false;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    // Sync with external value changes
    React.useEffect(() => {
        try {
            const currentParsed = text.trim() ? JSON.parse(text) : {};
            if (JSON.stringify(currentParsed) !== JSON.stringify(value)) {
                setText(JSON.stringify(value ?? {}, null, 2));
                setError(null);
            }
        } catch {
            // Keep current text if comparison fails
        }
    }, [value]);

    const handleChange = (newText: string) => {
        setText(newText);
        setIsPending(true);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        timeoutRef.current = setTimeout(() => {
            if (!mountedRef.current) return;
            setIsPending(false);

            if (!newText.trim()) {
                setError(null);
                onChange({});
                return;
            }

            try {
                const parsed = JSON.parse(newText);
                if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
                    setError('Headers must be a JSON object');
                    return;
                }
                setError(null);
                onChange(parsed);
            } catch (e) {
                const err = e as SyntaxError;
                let message = err.message.replace(/^JSON\.parse: /, '').replace(/^SyntaxError: /, '');
                const posMatch = message.match(/at position (\d+)/i);
                if (posMatch) {
                    const pos = parseInt(posMatch[1], 10);
                    const lines = newText.substring(0, pos).split('\n');
                    message = message.replace(/ at position \d+/, '').replace(/ in JSON at position \d+/, '');
                    setError(`Invalid JSON: ${message} (line ${lines.length}, col ${lines[lines.length - 1].length + 1})`);
                } else {
                    setError(`Invalid JSON: ${message}`);
                }
            }
        }, 300);
    };

    const getBorderClass = () => {
        if (error) return 'border-red-500 focus:border-red-500';
        if (isPending) return 'border-amber-400';
        return '';
    };

    return (
        <div className="space-y-1.5">
            <Label>Headers (JSON)</Label>
            <Textarea
                value={text}
                onChange={(e) => handleChange(e.target.value)}
                placeholder='{"Authorization": "Bearer token"}'
                rows={3}
                className={`font-mono text-sm ${getBorderClass()}`}
            />
            {error && (
                <div className="flex items-start gap-1.5 text-red-600">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <p className="text-xs">{error}</p>
                </div>
            )}
        </div>
    );
}

export default SourceStep;
