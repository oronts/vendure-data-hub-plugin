import type { ImportConfiguration } from './types';

type ImportSource = ImportConfiguration['source'];
type FileSourceConfig = NonNullable<ImportSource['fileConfig']>;
type ApiSourceConfig = NonNullable<ImportSource['apiConfig']>;

export function createImportTemplateSource(
    sourceType: ImportSource['type'],
    fileFormat?: FileSourceConfig['format'],
): ImportSource {
    if (sourceType === 'FILE') {
        return mergeFileSourceConfig(undefined, {
            format: fileFormat ?? 'CSV',
        });
    }
    if (sourceType === 'API') {
        return mergeApiSourceConfig(undefined, {});
    }
    return { type: sourceType };
}

export function isImportSourceAvailable(
    sourceType: string | undefined,
    canManageFiles: boolean,
): boolean {
    return sourceType !== 'FILE' || canManageFiles;
}

export function createDefaultImportSource(canManageFiles: boolean): ImportSource {
    return canManageFiles
        ? mergeFileSourceConfig(undefined, {})
        : mergeApiSourceConfig(undefined, {});
}

export function mergeFileSourceConfig(
    source: ImportSource | undefined,
    updates: Partial<FileSourceConfig>,
): ImportSource {
    const current = source?.fileConfig;
    return {
        ...source,
        type: 'FILE',
        fileConfig: {
            format: current?.format ?? 'CSV',
            hasHeaders: current?.hasHeaders ?? true,
            ...current,
            ...updates,
        },
    };
}

export function mergeApiSourceConfig(
    source: ImportSource | undefined,
    updates: Partial<ApiSourceConfig>,
): ImportSource {
    const current = source?.apiConfig;
    return {
        ...source,
        type: 'API',
        apiConfig: {
            url: current?.url ?? '',
            method: current?.method ?? 'GET',
            ...current,
            ...updates,
        },
    };
}
