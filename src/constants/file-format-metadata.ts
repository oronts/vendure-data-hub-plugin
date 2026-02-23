export interface FileFormatMetadata {
    value: string;
    label: string;
    extensions: string[];
    mimeTypes: string[];
    supportsPreview: boolean;
    requiresClientParser: boolean;
    description?: string;
}
export const FILE_FORMAT_METADATA: Record<string, FileFormatMetadata> = {
    CSV: {
        value: 'CSV',
        label: 'CSV',
        extensions: ['.csv', '.tsv'],
        mimeTypes: ['text/csv', 'text/tab-separated-values', 'text/comma-separated-values'],
        supportsPreview: true,
        requiresClientParser: true,
        description: 'Comma-separated values (CSV) and tab-separated values (TSV)',
    },
    JSON: {
        value: 'JSON',
        label: 'JSON',
        extensions: ['.json'],
        mimeTypes: ['application/json', 'text/json'],
        supportsPreview: true,
        requiresClientParser: true,
        description: 'JavaScript Object Notation (JSON)',
    },
    XML: {
        value: 'XML',
        label: 'XML',
        extensions: ['.xml'],
        mimeTypes: ['text/xml', 'application/xml'],
        supportsPreview: false, // Backend-only parsing (complex XML schemas)
        requiresClientParser: false,
        description: 'Extensible Markup Language (XML)',
    },
    XLSX: {
        value: 'XLSX',
        label: 'Excel',
        extensions: ['.xlsx', '.xls'],
        mimeTypes: [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
        ],
        supportsPreview: true,
        requiresClientParser: true,
        description: 'Microsoft Excel spreadsheet (XLSX, XLS)',
    },
    NDJSON: {
        value: 'NDJSON',
        label: 'NDJSON',
        extensions: ['.ndjson', '.jsonl'],
        mimeTypes: ['application/x-ndjson', 'application/jsonlines'],
        supportsPreview: true,
        requiresClientParser: true,
        description: 'Newline-delimited JSON (NDJSON)',
    },
    TSV: {
        value: 'TSV',
        label: 'TSV',
        extensions: ['.tsv'],
        mimeTypes: ['text/tab-separated-values'],
        supportsPreview: true,
        requiresClientParser: true, // Uses CSV parser with tab delimiter
        description: 'Tab-separated values (TSV)',
    },
    PARQUET: {
        value: 'PARQUET',
        label: 'Parquet',
        extensions: ['.parquet'],
        mimeTypes: ['application/octet-stream', 'application/parquet'],
        supportsPreview: false, // Backend-only (binary columnar format)
        requiresClientParser: false,
        description: 'Apache Parquet columnar storage format',
    },
};

export const FILE_FORMATS = Object.keys(FILE_FORMAT_METADATA);

export const PREVIEW_FORMATS = Object.values(FILE_FORMAT_METADATA)
    .filter(f => f.supportsPreview)
    .map(f => f.value);

export const EXTENSION_TO_FORMAT = new Map<string, string>(
    Object.values(FILE_FORMAT_METADATA).flatMap(format =>
        format.extensions.map(ext => [ext.toLowerCase(), format.value])
    )
);

export const MIME_TO_FORMAT = new Map<string, string>(
    Object.values(FILE_FORMAT_METADATA).flatMap(format =>
        format.mimeTypes.map(mime => [mime.toLowerCase(), format.value])
    )
);
