import * as React from 'react';
import { Trans } from '@lingui/react/macro';
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
import { FileText } from 'lucide-react';
import {
    FILE_FORMAT_REGISTRY,
} from '../../../constants';
import { useFileFormats, useOptionValues } from '../../../hooks/api/use-config-options';
import { resolveIconName } from '../../../utils';
import { FileDropzone } from '../../shared/file-dropzone';
import { FILE_FORMAT } from '../shared';
import { IMPORT_PLACEHOLDERS } from './constants';
import { mergeFileSourceConfig } from './source-config';
import type {
    FileFormat,
    ImportConfiguration,
} from './types';

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

interface SourceFileConfigProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    uploadedFile: File | null;
    setUploadedFile: (file: File | null) => void;
    isParsing: boolean;
}

export function SourceFileConfig({
    config,
    updateConfig,
    uploadedFile,
    setUploadedFile,
    isParsing,
}: SourceFileConfigProps) {
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
            updateConfig({
                source: mergeFileSourceConfig(config.source, updates),
            });
        },
        [config.source, updateConfig],
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle>
                    <Trans>File configuration</Trans>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label
                        id={FILE_SOURCE_FIELD_IDS.FORMAT_LABEL}
                        className="mb-2 block"
                    >
                        <Trans>File format</Trans>
                    </Label>
                    <div
                        className="flex gap-2"
                        role="group"
                        aria-labelledby={FILE_SOURCE_FIELD_IDS.FORMAT_LABEL}
                    >
                        {fileFormats.map(format => {
                            const Icon = resolveIconName(format.icon) ?? FileText;
                            const isSelected =
                                config.source?.fileConfig?.format === format.value;

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
                                <Trans>Delimiter</Trans>
                            </Label>
                            <Select
                                value={config.source.fileConfig.delimiter ?? ','}
                                onValueChange={delimiter => {
                                    if (delimiter != null) updateFileConfig({ delimiter });
                                }}
                            >
                                <SelectTrigger id={FILE_SOURCE_FIELD_IDS.DELIMITER}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {delimiterOptions.map(delimiter => (
                                        <SelectItem
                                            key={delimiter.value}
                                            value={delimiter.value}
                                        >
                                            {delimiter.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-3">
                            <Switch
                                id={FILE_SOURCE_FIELD_IDS.CSV_HEADERS}
                                checked={config.source.fileConfig.hasHeaders ?? true}
                                onCheckedChange={hasHeaders =>
                                    updateFileConfig({ hasHeaders })}
                            />
                            <Label htmlFor={FILE_SOURCE_FIELD_IDS.CSV_HEADERS}>
                                <Trans>First row contains headers</Trans>
                            </Label>
                        </div>
                    </div>
                )}

                {config.source?.fileConfig?.format === FILE_FORMAT.JSON && (
                    <div>
                        <Label htmlFor={FILE_SOURCE_FIELD_IDS.ITEMS_PATH}>
                            <Trans>Items path</Trans>
                        </Label>
                        <Input
                            id={FILE_SOURCE_FIELD_IDS.ITEMS_PATH}
                            value={config.source.fileConfig.itemsPath ?? ''}
                            onChange={event =>
                                updateFileConfig({ itemsPath: event.target.value })}
                            placeholder={IMPORT_PLACEHOLDERS.jsonItemsPath}
                        />
                    </div>
                )}

                {config.source?.fileConfig?.format === FILE_FORMAT.XML && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <Label htmlFor={FILE_SOURCE_FIELD_IDS.RECORD_PATH}>
                                <Trans>Record path</Trans>
                            </Label>
                            <Input
                                id={FILE_SOURCE_FIELD_IDS.RECORD_PATH}
                                value={config.source.fileConfig.recordPath ?? ''}
                                onChange={event => updateFileConfig({
                                    recordPath: event.target.value,
                                })}
                                placeholder={IMPORT_PLACEHOLDERS.xmlRecordPath}
                            />
                        </div>
                        <div>
                            <Label htmlFor={FILE_SOURCE_FIELD_IDS.ATTRIBUTE_PREFIX}>
                                <Trans>Attribute prefix</Trans>
                            </Label>
                            <Input
                                id={FILE_SOURCE_FIELD_IDS.ATTRIBUTE_PREFIX}
                                value={config.source.fileConfig.attributePrefix ?? ''}
                                onChange={event => updateFileConfig({
                                    attributePrefix: event.target.value,
                                })}
                                placeholder={IMPORT_PLACEHOLDERS.xmlAttributePrefix}
                            />
                        </div>
                    </div>
                )}

                {config.source?.fileConfig?.format === FILE_FORMAT.XLSX && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <Label htmlFor={FILE_SOURCE_FIELD_IDS.SHEET}>
                                <Trans>Sheet name or index</Trans>
                            </Label>
                            <Input
                                id={FILE_SOURCE_FIELD_IDS.SHEET}
                                value={config.source.fileConfig.sheetName ?? ''}
                                onChange={event =>
                                    updateFileConfig({ sheetName: event.target.value })}
                                placeholder={IMPORT_PLACEHOLDERS.xlsxSheet}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <Switch
                                id={FILE_SOURCE_FIELD_IDS.XLSX_HEADERS}
                                checked={config.source.fileConfig.hasHeaders ?? true}
                                onCheckedChange={hasHeaders =>
                                    updateFileConfig({ hasHeaders })}
                            />
                            <Label htmlFor={FILE_SOURCE_FIELD_IDS.XLSX_HEADERS}>
                                <Trans>First row contains headers</Trans>
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
