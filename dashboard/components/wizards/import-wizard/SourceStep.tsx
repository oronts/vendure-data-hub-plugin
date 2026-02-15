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
} from '@vendure/dashboard';
import { Play, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { JsonTextarea } from '../../common/JsonTextarea';
import {
    WizardStepContainer,
    SOURCE_TYPE_ICONS,
    FILE_FORMAT_ICONS,
    SOURCE_TYPE,
    FILE_FORMAT,
} from '../shared';
import { SelectableCard, SelectableCardGrid } from '../../shared/selectable-card';
import { FileDropzone } from '../../shared/file-dropzone';
import { SOURCE_TYPES, FILE_FORMATS, STEP_CONTENT, PLACEHOLDERS } from './Constants';
import { CSV_DELIMITERS, TOAST_WIZARD, TOAST_CONNECTION } from '../../../constants';
import { TEST_STATUS } from '../../../constants/UiStates';
import type {
    ImportConfiguration,
    SourceType,
    FileFormat,
    ApiMethod,
} from './Types';

interface SourceStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    uploadedFile: File | null;
    setUploadedFile: (file: File | null) => void;
    isParsing: boolean;
    errors?: Record<string, string>;
}

export function SourceStep({
    config,
    updateConfig,
    uploadedFile,
    setUploadedFile,
    isParsing,
    errors = {},
}: SourceStepProps) {
    return (
        <WizardStepContainer
            title={STEP_CONTENT.source.title}
            description={STEP_CONTENT.source.description}
        >
            <SelectableCardGrid columns={4}>
                {SOURCE_TYPES.map(type => (
                    <SelectableCard
                        key={type.id}
                        icon={SOURCE_TYPE_ICONS[type.id]}
                        title={type.label}
                        description={type.description}
                        selected={config.source?.type === type.id}
                        onClick={() => updateConfig({
                            source: { type: type.id as SourceType },
                        })}
                    />
                ))}
            </SelectableCardGrid>

            {config.source?.type === SOURCE_TYPE.FILE && (
                <FileUploadConfig
                    config={config}
                    updateConfig={updateConfig}
                    uploadedFile={uploadedFile}
                    setUploadedFile={setUploadedFile}
                    isParsing={isParsing}
                />
            )}

            {config.source?.type === SOURCE_TYPE.API && (
                <ApiConfig config={config} updateConfig={updateConfig} />
            )}
        </WizardStepContainer>
    );
}

interface FileUploadConfigProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    uploadedFile: File | null;
    setUploadedFile: (file: File | null) => void;
    isParsing: boolean;
}

function FileUploadConfig({
    config,
    updateConfig,
    uploadedFile,
    setUploadedFile,
    isParsing,
}: FileUploadConfigProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>File Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label className="mb-2 block">File Format</Label>
                    <div className="flex gap-2">
                        {FILE_FORMATS.map(format => {
                            const Icon = FILE_FORMAT_ICONS[format.id];
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

                {config.source?.fileConfig?.format === FILE_FORMAT.CSV && (
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
                                    {CSV_DELIMITERS.map(d => (
                                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                    ))}
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

                <FileDropzone
                    onFileSelect={setUploadedFile}
                    allowedTypes={['CSV', 'XLSX', 'JSON', 'XML']}
                    loading={isParsing}
                    selectedFile={uploadedFile}
                    onClear={() => setUploadedFile(null)}
                    showFileIcons={false}
                    compact
                />
            </CardContent>
        </Card>
    );
}

interface ApiConfigProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

function ApiConfig({ config, updateConfig }: ApiConfigProps) {
    const [testStatus, setTestStatus] = React.useState<typeof TEST_STATUS[keyof typeof TEST_STATUS]>(TEST_STATUS.IDLE);

    const handleTestConnection = async () => {
        const url = config.source?.apiConfig?.url;
        if (!url) {
            toast.error(TOAST_WIZARD.URL_REQUIRED);
            return;
        }

        setTestStatus(TEST_STATUS.TESTING);
        try {
            const method = config.source?.apiConfig?.method ?? 'GET';
            const headers = config.source?.apiConfig?.headers ?? {};

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
                mode: 'cors',
            });

            if (response.ok) {
                setTestStatus(TEST_STATUS.SUCCESS);
                toast.success(TOAST_CONNECTION.TEST_SUCCESS);
            } else {
                setTestStatus(TEST_STATUS.ERROR);
                toast.error(TOAST_CONNECTION.TEST_FAILED, {
                    description: `${response.status} ${response.statusText}`,
                });
            }
        } catch (err) {
            setTestStatus(TEST_STATUS.ERROR);
            toast.error(TOAST_CONNECTION.TEST_FAILED, {
                description: err instanceof Error ? err.message : 'Unknown error',
            });
        }
    };

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
                            placeholder={PLACEHOLDERS.apiUrl}
                        />
                    </div>
                </div>

                <JsonTextarea
                    label="Headers (JSON)"
                    value={config.source?.apiConfig?.headers ?? {}}
                    onChange={(headers) => updateConfig({
                        source: {
                            ...config.source!,
                            apiConfig: { ...config.source?.apiConfig!, headers: headers as Record<string, string> },
                        },
                    })}
                    placeholder='{"Authorization": "Bearer token"}'
                    rows={3}
                    expectedType="object"
                    allowEmpty={true}
                    showStatus={false}
                />

                <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={testStatus === TEST_STATUS.TESTING || !config.source?.apiConfig?.url}
                >
                    {testStatus === TEST_STATUS.TESTING ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : testStatus === TEST_STATUS.SUCCESS ? (
                        <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                    ) : testStatus === TEST_STATUS.ERROR ? (
                        <XCircle className="w-4 h-4 mr-2 text-red-600" />
                    ) : (
                        <Play className="w-4 h-4 mr-2" />
                    )}
                    {testStatus === TEST_STATUS.TESTING ? 'Testing...' : 'Test Connection'}
                </Button>
            </CardContent>
        </Card>
    );
}
