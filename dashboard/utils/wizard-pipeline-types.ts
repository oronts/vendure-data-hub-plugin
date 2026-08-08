export interface LoaderAdapterInfo {
    code: string;
    entityType?: string | null;
    schema?: { fields?: Array<{ key: string }> };
}

export interface ImportAdapterResolver {
    getLoaderAdapterCode(entityType: string): string | undefined;
}

export interface ExportAdapterResolver {
    getExportAdapterCode(formatType: string): string | undefined;
}
