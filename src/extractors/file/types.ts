import { ExtractorConfig } from '../../types/index';
import { FileFormat } from '../../parsers/file-parser.service';

export interface FileExtractorConfig extends ExtractorConfig {
    /** File path or glob pattern */
    path: string;

    /** Base directory for relative paths */
    baseDir?: string;

    /** File format (auto-detected if not specified) */
    format?: FileFormat;

    /** CSV parsing options */
    csv?: {
        delimiter?: ',' | ';' | '\t' | '|';
        header?: boolean;
        skipEmptyLines?: boolean;
        encoding?: BufferEncoding;
    };

    /** JSON parsing options */
    json?: {
        path?: string; // JSONPath to data array
    };

    /** XML parsing options */
    xml?: {
        recordPath?: string;
        attributePrefix?: string;
    };

    /** Excel parsing options */
    xlsx?: {
        sheet?: string | number;
        range?: string;
        header?: boolean;
    };

    /** Only process files modified after this date */
    modifiedAfter?: string;

    /** Include file metadata in records */
    includeFileMetadata?: boolean;

    /** Maximum files to process (safety limit) */
    maxFiles?: number;

    /** Sort files by: 'name' | 'modified' | 'size' */
    sortBy?: 'name' | 'modified' | 'size';

    /** Sort order */
    sortOrder?: 'asc' | 'desc';

    /** Continue on file parse errors */
    continueOnError?: boolean;
}

export interface FileInfo {
    path: string;
    name: string;
    size: number;
    modifiedAt: Date;
}

export const FILE_EXTRACTOR_DEFAULTS = {
    maxFiles: 100,
    sortBy: 'modified' as const,
    sortOrder: 'asc' as const,
    continueOnError: true,
} as const;
