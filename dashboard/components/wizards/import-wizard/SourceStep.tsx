import * as React from 'react';
import { useLingui } from '@lingui/react';
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
import {
    IMPORT_WIZARD_TRANSLATION_IDS,
    TEST_STATUS,
} from '../../../constants';
import { FILE_FORMAT_REGISTRY } from '../../../constants/file-format-registry';
import { useFileFormats, useOptionValues } from '../../../hooks/api/use-config-options';
import { previewExtract } from '../../../hooks/api/use-step-tester';
import { validateUrl } from '../../../utils/form-validation';
import { useAdaptersByType } from '../../../hooks/api/use-adapters';
import { useAdapterCatalog } from '../../../hooks/use-adapter-catalog';
import { SchemaFormRenderer } from '../../shared/schema-form/SchemaFormRenderer';
import type {
    ImportConfiguration,
    SourceType,
    FileFormat,
    ApiMethod,
} from './types';
import {
    isImportSourceAvailable,
    mergeApiSourceConfig,
    mergeFileSourceConfig,
} from './source-config';

/** Smart sources with custom, hand-built UIs (FILE has FileDropzone, API has HeadersEditor). */
const SMART_SOURCES = [
    {
        id: 'FILE',
        label: IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_FILE_UPLOAD,
        description: IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_FILE_UPLOAD_DESCRIPTION,
    },
    {
        id: 'API',
        label: IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_REST_API,
        description: IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_REST_API_DESCRIPTION,
    },
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
const SMART_SOURCE_CODES = new Set(['csv', 'json', 'xml', 'xlsx', 'httpApi', 'file']);

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
    canManageFiles: boolean;
}

/** Timeout in milliseconds for the API connection test. */
const API_TEST_TIMEOUT_MS = 10_000;

/** Number of placeholder cards shown while extractors are loading. */
const LOADING_CARD_COUNT = 6;

const FILE_SOURCE_FIELD_IDS = {
    FORMAT_LABEL: 'import-source-file-format-label',
    DELIMITER: 'import-source-file-delimiter',
    CSV_HEADERS: 'import-source-file-csv-headers',
    ITEMS_PATH: 'import-source-file-items-path',
    RECORD_PATH: 'import-source-file-record-path',
    ATTRIBUTE_PREFIX: 'import-source-file-attribute-prefix',
    SHEET: 'import-source-file-sheet',
    XLSX_HEADERS: 'import-source-file-xlsx-headers',
} as const;

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
    canManageFiles,
}: SourceStepProps) {
    const { i18n } = useLingui();
    const { data: extractors, isLoading: isLoadingExtractors } = useAdaptersByType('EXTRACTOR');
    const smartSources = React.useMemo(
        () => SMART_SOURCES.filter(source =>
            isImportSourceAvailable(source.id, canManageFiles)),
        [canManageFiles],
    );

    // Dynamic sources from backend (everything except smart sources and wizard-hidden extractors).
    // Each dynamic source carries its backend-provided icon name resolved via resolveIconName().
    const dynamicSources = React.useMemo(() => {
        if (!extractors) return [];
        return extractors
            .filter(e => !SMART_SOURCE_CODES.has(e.code) && e.wizardHidden !== true)
            .map(e => ({
                id: e.code,
                label: e.name ?? e.code,
                description: e.description ?? '',
                iconName: e.icon ?? undefined,
            }));
    }, [extractors]);

    const allSources = React.useMemo(
        () => [
            ...smartSources.map(source => ({
                ...source,
                label: i18n._(source.label),
                description: i18n._(source.description),
                iconName: undefined as string | undefined,
            })),
            ...dynamicSources,
        ],
        [dynamicSources, i18n, smartSources],
    );

    const schemaSourceType = config.source?.type;
    const isSchemaSource = schemaSourceType
        && schemaSourceType !== SOURCE_TYPE.FILE
        && schemaSourceType !== SOURCE_TYPE.API;

    return (
        <WizardStepContainer
            title={i18n._(STEP_CONTENT.source.title)}
            description={i18n._(STEP_CONTENT.source.description)}
        >
            {isLoadingExtractors ? (
                <SelectableCardGrid columns={4}>
                    {smartSources.map(type => (
                        <SelectableCard
                            key={type.id}
                            icon={SMART_SOURCE_ICONS[type.id] ?? Database}
                            title={i18n._(type.label)}
                            description={i18n._(type.description)}
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

            {canManageFiles && config.source?.type === SOURCE_TYPE.FILE && (
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

            {isSchemaSource && schemaSourceType && (
                <AdapterConfigForm
                    adapterCode={getAdapterCodeForSourceType(schemaSourceType, extractors)}
                    config={config}
                    updateConfig={updateConfig}
                    configKey={`${schemaSourceType.toLowerCase()}Config`}
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
    const { i18n } = useLingui();
    const { options: delimiterOptions } = useOptionValues('csvDelimiters');
    const { options: fileFormats } = useFileFormats();
    const allowedFileTypes = React.useMemo(
        () => fileFormats.length > 0
            ? fileFormats
                .map(format => format.value)
                .filter(value => FILE_FORMAT_REGISTRY.has(value))
            : Array.from(FILE_FORMAT_REGISTRY.keys()),
        [fileFormats],
    );
    const updateFileConfig = React.useCallback(
        (updates: Parameters<typeof mergeFileSourceConfig>[1]) => {
            updateConfig({ source: mergeFileSourceConfig(config.source, updates) });
        },
        [config.source, updateConfig],
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle>{i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_FILE_CONFIGURATION)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label id={FILE_SOURCE_FIELD_IDS.FORMAT_LABEL} className="mb-2 block">
                        {i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_FILE_FORMAT)}
                    </Label>
                    <div
                        className="flex gap-2"
                        role="group"
                        aria-labelledby={FILE_SOURCE_FIELD_IDS.FORMAT_LABEL}
                    >
                        {fileFormats.map(format => {
                            const Icon = resolveIconName(format.icon) ?? FileText;
                            const isSelected = config.source?.fileConfig?.format === format.value;

                            return (
                                <Button
                                    key={format.value}
                                    variant={isSelected ? 'default' : 'outline'}
                                    onClick={() => updateFileConfig({
                                        format: format.value as FileFormat,
                                        hasHeaders: true,
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
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <Label htmlFor={FILE_SOURCE_FIELD_IDS.DELIMITER}>
                                {i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_DELIMITER)}
                            </Label>
                            <Select
                                value={config.source.fileConfig.delimiter ?? ','}
                                onValueChange={delimiter => updateFileConfig({ delimiter })}
                            >
                                <SelectTrigger id={FILE_SOURCE_FIELD_IDS.DELIMITER}>
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
                                id={FILE_SOURCE_FIELD_IDS.CSV_HEADERS}
                                checked={config.source.fileConfig.hasHeaders ?? true}
                                onCheckedChange={hasHeaders => updateFileConfig({ hasHeaders })}
                            />
                            <Label htmlFor={FILE_SOURCE_FIELD_IDS.CSV_HEADERS}>
                                {i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_FIRST_ROW_HEADERS)}
                            </Label>
                        </div>
                    </div>
                )}

                {config.source?.fileConfig?.format === FILE_FORMAT.JSON && (
                    <div>
                        <Label htmlFor={FILE_SOURCE_FIELD_IDS.ITEMS_PATH}>
                            {i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_ITEMS_PATH)}
                        </Label>
                        <Input
                            id={FILE_SOURCE_FIELD_IDS.ITEMS_PATH}
                            value={config.source.fileConfig.itemsPath ?? ''}
                            onChange={event => updateFileConfig({ itemsPath: event.target.value })}
                            placeholder={IMPORT_PLACEHOLDERS.jsonItemsPath}
                        />
                    </div>
                )}

                {config.source?.fileConfig?.format === FILE_FORMAT.XML && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <Label htmlFor={FILE_SOURCE_FIELD_IDS.RECORD_PATH}>
                                {i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_RECORD_PATH)}
                            </Label>
                            <Input
                                id={FILE_SOURCE_FIELD_IDS.RECORD_PATH}
                                value={config.source.fileConfig.recordPath ?? ''}
                                onChange={event => updateFileConfig({ recordPath: event.target.value })}
                                placeholder={IMPORT_PLACEHOLDERS.xmlRecordPath}
                            />
                        </div>
                        <div>
                            <Label htmlFor={FILE_SOURCE_FIELD_IDS.ATTRIBUTE_PREFIX}>
                                {i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_ATTRIBUTE_PREFIX)}
                            </Label>
                            <Input
                                id={FILE_SOURCE_FIELD_IDS.ATTRIBUTE_PREFIX}
                                value={config.source.fileConfig.attributePrefix ?? ''}
                                onChange={event => updateFileConfig({ attributePrefix: event.target.value })}
                                placeholder={IMPORT_PLACEHOLDERS.xmlAttributePrefix}
                            />
                        </div>
                    </div>
                )}

                {config.source?.fileConfig?.format === FILE_FORMAT.XLSX && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <Label htmlFor={FILE_SOURCE_FIELD_IDS.SHEET}>
                                {i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_SHEET_NAME_OR_INDEX)}
                            </Label>
                            <Input
                                id={FILE_SOURCE_FIELD_IDS.SHEET}
                                value={config.source.fileConfig.sheetName ?? ''}
                                onChange={event => updateFileConfig({ sheetName: event.target.value })}
                                placeholder={IMPORT_PLACEHOLDERS.xlsxSheet}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <Switch
                                id={FILE_SOURCE_FIELD_IDS.XLSX_HEADERS}
                                checked={config.source.fileConfig.hasHeaders ?? true}
                                onCheckedChange={hasHeaders => updateFileConfig({ hasHeaders })}
                            />
                            <Label htmlFor={FILE_SOURCE_FIELD_IDS.XLSX_HEADERS}>
                                {i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_FIRST_ROW_HEADERS)}
                            </Label>
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
    const { i18n } = useLingui();
    const { options: methods } = useOptionValues('httpMethods');
    const [testStatus, setTestStatus] = React.useState<typeof TEST_STATUS[keyof typeof TEST_STATUS]>(TEST_STATUS.IDLE);
    const updateApiConfig = React.useCallback(
        (updates: Parameters<typeof mergeApiSourceConfig>[1]) => {
            updateConfig({ source: mergeApiSourceConfig(config.source, updates) });
        },
        [config.source, updateConfig],
    );

    const handleTestConnection = async () => {
        const url = config.source?.apiConfig?.url;
        if (!url) {
            toast.error(i18n._(IMPORT_WIZARD_TRANSLATION_IDS.TOAST_URL_REQUIRED));
            return;
        }

        const urlError = validateUrl(url, i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_URL));
        if (urlError) {
            toast.error(i18n._(IMPORT_WIZARD_TRANSLATION_IDS.TOAST_INVALID_URL));
            return;
        }

        setTestStatus(TEST_STATUS.TESTING);
        try {
            await previewExtract({
                config: {
                    adapterCode: 'httpApi',
                    ...config.source?.apiConfig,
                    timeoutMs: API_TEST_TIMEOUT_MS,
                },
            }, 1);
            setTestStatus(TEST_STATUS.SUCCESS);
            toast.success(i18n._(IMPORT_WIZARD_TRANSLATION_IDS.TOAST_CONNECTION_SUCCESS));
        } catch (err) {
            setTestStatus(TEST_STATUS.ERROR);
            toast.error(i18n._(IMPORT_WIZARD_TRANSLATION_IDS.TOAST_CONNECTION_FAILED), {
                description: getErrorMessage(err),
            });
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_API_CONFIGURATION)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div>
                        <Label htmlFor="import-source-api-method">
                            {i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_METHOD)}
                        </Label>
                        <Select
                            value={config.source?.apiConfig?.method ?? 'GET'}
                            onValueChange={method => updateApiConfig({ method: method as ApiMethod })}
                        >
                            <SelectTrigger id="import-source-api-method">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {methods.map(m => (
                                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="md:col-span-3">
                        <Label htmlFor="import-source-api-url">
                            {i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_URL)}
                        </Label>
                        <Input
                            id="import-source-api-url"
                            type="url"
                            value={config.source?.apiConfig?.url ?? ''}
                            onChange={e => updateApiConfig({ url: e.target.value })}
                            placeholder={IMPORT_PLACEHOLDERS.apiUrl}
                        />
                    </div>
                </div>

                <HeadersEditor
                    headers={config.source?.apiConfig?.headers ?? {}}
                    onChange={headers => updateApiConfig({ headers })}
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
                    {testStatus === TEST_STATUS.TESTING
                        ? i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_TESTING)
                        : i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_TEST_CONNECTION)}
                </Button>
            </CardContent>
        </Card>
    );
}

/**
 * Generic adapter config form driven by the backend adapter schema.
 * Used for DATABASE, CDC, WEBHOOK, and any future extractor types.
 * The schema comes from the normalized backend adapter catalog.
 */
function AdapterConfigForm({ adapterCode, config, updateConfig, configKey, errors = {} }: {
    adapterCode: string;
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    configKey: string;
    errors?: Record<string, string>;
}) {
    const { i18n } = useLingui();
    const {
        adapters,
        isLoading,
        error,
    } = useAdapterCatalog();

    const adapter = React.useMemo(
        () => adapters.find(candidate => candidate.type === 'EXTRACTOR' && candidate.code === adapterCode),
        [adapters, adapterCode],
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

    if (isLoading) {
        return (
            <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                    {i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_LOADING_ADAPTER_CONFIGURATION)}
                </CardContent>
            </Card>
        );
    }

    if (error || !adapter) {
        return (
            <Card>
                <CardContent className="py-8 text-center text-destructive">
                    {i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SOURCE_ADAPTER_CONFIGURATION_ERROR)}
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
                    errors={errors}
                />
            </CardContent>
        </Card>
    );
}

/** All non-FILE/API source types use AdapterConfigForm above, schema-driven from backend registry */
