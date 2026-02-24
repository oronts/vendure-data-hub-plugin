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
import { Play, Loader2, CheckCircle2, XCircle, Database, BoxSelect, Upload, Globe, FileText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { HeadersEditor } from '../../common/HeadersEditor';
import {
    WizardStepContainer,
    SOURCE_TYPE,
    FILE_FORMAT,
} from '../shared';
import { resolveIconName } from '../../../utils';
import { SelectableCard, SelectableCardGrid } from '../../shared/selectable-card';
import { FileDropzone } from '../../shared/file-dropzone';
import { STEP_CONTENT, IMPORT_PLACEHOLDERS } from './constants';
import { getErrorMessage } from '../../../../shared';
import { TOAST_WIZARD, TOAST_CONNECTION, TEST_STATUS, SENTINEL_VALUES } from '../../../constants';
import { useOptionValues } from '../../../hooks/api/use-config-options';
import { validateUrl } from '../../../utils/form-validation';
import { useConnections } from '../../../hooks/api/use-connections';
import { useAdaptersByType } from '../../../hooks/api/use-adapters';
import { SchemaFormRenderer } from '../../shared/schema-form/SchemaFormRenderer';
import type {
    ImportConfiguration,
    SourceType,
    FileFormat,
    ApiMethod,
} from './types';

/** Smart sources with custom, hand-built UIs (FILE has FileDropzone, API has HeadersEditor). */
const SMART_SOURCES = [
    { id: 'FILE', label: 'File Upload', description: 'CSV, Excel, JSON, XML' },
    { id: 'API', label: 'REST API', description: 'Fetch from HTTP endpoint' },
] as const;

/**
 * Icons for smart sources only. These are hand-built wizard UI types, not backend
 * adapters, so they have no backend-provided icon metadata to resolve from.
 */
const SMART_SOURCE_ICONS: Record<string, LucideIcon> = {
    FILE: Upload,
    API: Globe,
};

/**
 * Extractor adapter codes that map to the smart source UIs above.
 * 'file' extractor is handled by the FILE smart source (FileDropzone + format selection).
 */
const SMART_SOURCE_CODES = new Set(['csv', 'json', 'httpApi', 'file']);

/**
 * Resolve the backend extractor adapter code for a given wizard source type.
 * Searches the available extractors first (case-insensitive match),
 * then falls back to lowercase convention for unknown types.
 */
function getAdapterCodeForSourceType(
    sourceType: string,
    extractors?: Array<{ code: string }>,
): string {
    const found = extractors?.find(e => e.code.toUpperCase() === sourceType.toUpperCase());
    return found?.code ?? sourceType.toLowerCase();
}

interface SourceStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    uploadedFile: File | null;
    setUploadedFile: (file: File | null) => void;
    isParsing: boolean;
    errors?: Record<string, string>;
}

/** Timeout in milliseconds for the API connection test. */
const API_TEST_TIMEOUT_MS = 10_000;

/** Number of placeholder cards shown while extractors are loading. */
const LOADING_CARD_COUNT = 6;

/**
 * Resolve the display icon for a source type.
 * Prefers the backend-provided adapter icon (via resolveIconName), then
 * falls back to the smart-source icon map (for hand-built UI types like FILE/API),
 * then to the provided fallback.
 */
function resolveSourceIcon(
    sourceId: string,
    iconName: string | undefined,
    fallback: LucideIcon,
): LucideIcon {
    if (iconName) {
        const resolved = resolveIconName(iconName);
        if (resolved) return resolved;
    }
    return SMART_SOURCE_ICONS[sourceId] ?? fallback;
}

export function SourceStep({
    config,
    updateConfig,
    uploadedFile,
    setUploadedFile,
    isParsing,
    errors = {},
}: SourceStepProps) {
    const { data: extractors, isLoading: isLoadingExtractors } = useAdaptersByType('EXTRACTOR');

    // Dynamic sources from backend (everything except smart sources and wizard-hidden extractors).
    // Each dynamic source carries its backend-provided icon name resolved via resolveIconName().
    const dynamicSources = React.useMemo(() => {
        if (!extractors) return [];
        return extractors
            .filter(e => !SMART_SOURCE_CODES.has(e.code) && e.wizardHidden !== true)
            .map(e => ({
                id: e.code.toUpperCase(),
                label: e.name ?? e.code,
                description: e.description ?? '',
                iconName: e.icon ?? undefined,
            }));
    }, [extractors]);

    const allSources = React.useMemo(
        () => [
            ...SMART_SOURCES.map(s => ({ ...s, iconName: undefined as string | undefined })),
            ...dynamicSources,
        ],
        [dynamicSources],
    );

    const isSchemaSource = config.source?.type
        && config.source.type !== SOURCE_TYPE.FILE
        && config.source.type !== SOURCE_TYPE.API;

    return (
        <WizardStepContainer
            title={STEP_CONTENT.source.title}
            description={STEP_CONTENT.source.description}
        >
            {isLoadingExtractors ? (
                <SelectableCardGrid columns={4}>
                    {SMART_SOURCES.map(type => (
                        <SelectableCard
                            key={type.id}
                            icon={SMART_SOURCE_ICONS[type.id] ?? Database}
                            title={type.label}
                            description={type.description}
                            selected={config.source?.type === type.id}
                            onClick={() => updateConfig({
                                source: { type: type.id as SourceType },
                            })}
                        />
                    ))}
                    {Array.from({ length: LOADING_CARD_COUNT }, (_, i) => (
                        <div
                            key={`loading-${i}`}
                            className="p-4 border rounded-lg animate-pulse"
                        >
                            <div className="w-8 h-8 bg-muted rounded mb-2" />
                            <div className="h-4 bg-muted rounded w-3/4 mb-1" />
                            <div className="h-3 bg-muted rounded w-full" />
                        </div>
                    ))}
                </SelectableCardGrid>
            ) : (
                <SelectableCardGrid columns={4}>
                    {allSources.map(type => (
                        <SelectableCard
                            key={type.id}
                            icon={resolveSourceIcon(type.id, type.iconName, BoxSelect)}
                            title={type.label}
                            description={type.description}
                            selected={config.source?.type === type.id}
                            onClick={() => updateConfig({
                                source: { type: type.id as SourceType },
                            })}
                        />
                    ))}
                </SelectableCardGrid>
            )}

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

            {isSchemaSource && (
                <AdapterConfigForm
                    adapterCode={getAdapterCodeForSourceType(config.source!.type!, extractors)}
                    config={config}
                    updateConfig={updateConfig}
                    configKey={`${config.source!.type!.toLowerCase()}Config`}
                    errors={errors}
                />
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
    const { options: delimiterOptions } = useOptionValues('csvDelimiters');
    const { options: fileFormats } = useOptionValues('fileFormats');
    const allowedFileTypes = React.useMemo(
        () => fileFormats.length > 0 ? fileFormats.map(f => f.value) : Object.values(FILE_FORMAT),
        [fileFormats],
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle>File Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label className="mb-2 block">File Format</Label>
                    <div className="flex gap-2">
                        {fileFormats.map(format => {
                            const Icon = resolveIconName(format.icon) ?? FileText;
                            const isSelected = config.source?.fileConfig?.format === format.value;

                            return (
                                <Button
                                    key={format.value}
                                    variant={isSelected ? 'default' : 'outline'}
                                    onClick={() => updateConfig({
                                        source: {
                                            ...config.source!,
                                            fileConfig: {
                                                ...config.source?.fileConfig,
                                                format: format.value as FileFormat,
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
                                    {delimiterOptions.map(d => (
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
                    allowedTypes={allowedFileTypes}
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

interface SourceConfigProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

type ApiConfigProps = SourceConfigProps;

function ApiConfig({ config, updateConfig }: ApiConfigProps) {
    const { options: methods } = useOptionValues('httpMethods');
    const [testStatus, setTestStatus] = React.useState<typeof TEST_STATUS[keyof typeof TEST_STATUS]>(TEST_STATUS.IDLE);

    const handleTestConnection = async () => {
        const url = config.source?.apiConfig?.url;
        if (!url) {
            toast.error(TOAST_WIZARD.URL_REQUIRED);
            return;
        }

        const urlError = validateUrl(url, 'API URL');
        if (urlError) {
            toast.error(urlError.message);
            return;
        }

        setTestStatus(TEST_STATUS.TESTING);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TEST_TIMEOUT_MS);
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
                signal: controller.signal,
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
            const message = err instanceof DOMException && err.name === 'AbortError'
                ? 'Request timed out after 10 seconds'
                : err instanceof TypeError
                    ? 'Network error - this may be caused by CORS restrictions on the target server'
                    : getErrorMessage(err);
            toast.error(TOAST_CONNECTION.TEST_FAILED, {
                description: message,
            });
        } finally {
            clearTimeout(timeoutId);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>API Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                                {methods.map(m => (
                                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                ))}
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
                            placeholder={IMPORT_PLACEHOLDERS.apiUrl}
                        />
                    </div>
                </div>

                <HeadersEditor
                    headers={config.source?.apiConfig?.headers ?? {}}
                    onChange={(headers) => updateConfig({
                        source: {
                            ...config.source!,
                            apiConfig: { ...config.source?.apiConfig!, headers },
                        },
                    })}
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

/**
 * Generic adapter config form driven by the backend adapter schema.
 * Used for DATABASE, CDC, WEBHOOK, and any future extractor types.
 * The schema comes from the backend registry via `useAdaptersByType('EXTRACTOR')`.
 */
function AdapterConfigForm({ adapterCode, config, updateConfig, configKey, errors = {} }: {
    adapterCode: string;
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    configKey: string;
    errors?: Record<string, string>;
}) {
    const { data: extractors } = useAdaptersByType('EXTRACTOR');
    const { data: connectionsData } = useConnections();

    const adapter = React.useMemo(
        () => extractors?.find(a => a.code === adapterCode),
        [extractors, adapterCode]
    );

    const connectionCodes = React.useMemo(
        () => (connectionsData?.items ?? []).map(c => c.code),
        [connectionsData]
    );

    const values = ((config.source as Record<string, unknown> | undefined)?.[configKey] ?? {}) as Record<string, unknown>;

    const handleChange = React.useCallback((newValues: Record<string, unknown>) => {
        updateConfig({
            source: {
                ...config.source!,
                [configKey]: newValues,
            },
        });
    }, [config.source, configKey, updateConfig]);

    if (!adapter?.schema) {
        return (
            <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                    Loading adapter configuration...
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>{adapter.name ?? adapter.code}</CardTitle>
                {adapter.description && (
                    <p className="text-sm text-muted-foreground">{adapter.description}</p>
                )}
            </CardHeader>
            <CardContent>
                <SchemaFormRenderer
                    schema={adapter.schema}
                    values={values}
                    onChange={handleChange}
                    connectionCodes={connectionCodes}
                    errors={errors}
                />
            </CardContent>
        </Card>
    );
}

/** All non-FILE/API source types use AdapterConfigForm above — schema-driven from backend registry */
