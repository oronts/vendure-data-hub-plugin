/**
 * File Extract Handler
 *
 * Extracts records from uploaded files or explicitly configured inline data.
 *
 * @module runtime/executors/extractors
 */

import { Injectable } from '@nestjs/common';
import { RecordObject, ExecutorContext } from '../../executor-types';
import { FileStorageService } from '../../../services/storage/file-storage.service';
import { FileParserService } from '../../../parsers/file-parser.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';
import { parseCsv, arrayToObject, getPath } from '../../utils';
import { LOGGER_CONTEXTS, PAGINATION } from '../../../constants/index';
import { ExtractorPreviewResult, JsonValue } from '../../../types/index';
import {
    ExtractHandler,
    ExtractHandlerContext,
    getExtractConfig,
    updateCheckpoint,
    getCheckpointValue,
} from './extract-handler.interface';
import { EXTRACTOR_CODE } from '../../../constants/index';
import { parseXml } from '../../../parsers/formats/xml.parser';
import { getErrorMessage } from '../../../utils/error.utils';

interface CsvExtractConfig {
    adapterCode?: string;
    fileId?: string;
    csvText?: string;
    rows?: unknown[];
    delimiter?: string;
    hasHeader?: boolean;
}

interface JsonExtractConfig {
    adapterCode?: string;
    fileId?: string;
    jsonText?: string;
    itemsPath?: string;
}

interface XmlExtractConfig {
    adapterCode?: string;
    fileId?: string;
    xmlText?: string;
    recordPath?: string;
    attributePrefix?: string;
}

interface XlsxExtractConfig {
    adapterCode?: string;
    fileId?: string;
    sheetName?: string | number;
    hasHeader?: boolean;
}

export class FileExtractionError extends Error {
    readonly name = 'FileExtractionError';
}

@Injectable()
export class FileExtractHandler implements ExtractHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private fileStorageService: FileStorageService,
        loggerFactory: DataHubLoggerFactory,
        private fileParserService: FileParserService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXTRACT_EXECUTOR);
    }


    async extract(context: ExtractHandlerContext): Promise<RecordObject[]> {
        const { step } = context;
        const cfg = getExtractConfig<CsvExtractConfig | JsonExtractConfig | XmlExtractConfig | XlsxExtractConfig>(step);
        const adapterCode = step.adapterCode ?? cfg.adapterCode;

        if (adapterCode === EXTRACTOR_CODE.CSV) {
            return this.extractCsv(context);
        }
        if (adapterCode === EXTRACTOR_CODE.JSON) {
            return this.extractJson(context);
        }
        if (adapterCode === EXTRACTOR_CODE.XML) {
            return this.extractXml(context);
        }
        if (adapterCode === EXTRACTOR_CODE.XLSX) {
            return this.extractXlsx(context);
        }

        throw new FileExtractionError(
            `Unknown file extractor type for step ${step.key}: ${String(adapterCode ?? '(none)')}`,
        );
    }

    async preview(
        context: ExtractHandlerContext,
        limit: number,
    ): Promise<ExtractorPreviewResult> {
        const cfg = getExtractConfig<
            CsvExtractConfig | JsonExtractConfig | XmlExtractConfig | XlsxExtractConfig
        >(context.step);
        await this.assertPreviewSourceSize(context.ctx, cfg);
        const previewContext: ExtractHandlerContext = {
            ...context,
            executorCtx: { ...context.executorCtx, recordLimit: limit },
        };
        const records = (await this.extract(previewContext)).slice(0, limit);

        return { records: records.map(data => ({ data })) };
    }

    private async assertPreviewSourceSize(
        ctx: ExtractHandlerContext['ctx'],
        cfg: CsvExtractConfig | JsonExtractConfig | XmlExtractConfig | XlsxExtractConfig,
    ): Promise<void> {
        if (cfg.fileId) {
            const file = await this.fileStorageService.getFile(ctx, cfg.fileId);
            if (!file) {
                throw new Error(`Uploaded file not found: ${cfg.fileId}`);
            }
            this.assertPreviewBytes(file.size);
        }

        for (const value of [
            (cfg as CsvExtractConfig).csvText,
            (cfg as JsonExtractConfig).jsonText,
            (cfg as XmlExtractConfig).xmlText,
        ]) {
            if (typeof value === 'string') {
                this.assertPreviewBytes(Buffer.byteLength(value, 'utf8'));
            }
        }
    }

    private assertPreviewBytes(size: number): void {
        if (size > PAGINATION.FILE_PREVIEW_MAX_BYTES) {
            throw new Error(
                `File preview source exceeds ${PAGINATION.FILE_PREVIEW_MAX_BYTES} bytes`,
            );
        }
    }

    async extractCsv(context: ExtractHandlerContext): Promise<RecordObject[]> {
        const { step, executorCtx } = context;
        const cfg = getExtractConfig<CsvExtractConfig>(step);

        const delimiter = cfg.delimiter ?? ',';
        const hasHeader = cfg.hasHeader !== false;
        const resetCheckpoint = (cfg as Record<string, unknown>).resetCheckpoint === true;
        const offset = resetCheckpoint ? 0 : getCheckpointValue(executorCtx, step.key, 'offset', 0);

        const records = await this.loadCsvRecords(context.ctx, cfg, step.key, delimiter, hasHeader);
        return this.applyOffsetAndCheckpoint(records, offset, executorCtx, step.key);
    }

    private async loadCsvRecords(
        ctx: ExtractHandlerContext['ctx'],
        cfg: CsvExtractConfig,
        stepKey: string,
        delimiter: string,
        hasHeader: boolean,
    ): Promise<RecordObject[]> {
        // Priority 1: fileId - uploaded file
        if (cfg.fileId) {
            return this.loadCsvFromUpload(ctx, cfg.fileId, stepKey, delimiter, hasHeader);
        }

        // Priority 2: rows - inline array (handle both direct and nested config shapes)
        const nestedConfig = (cfg as Record<string, unknown>).config as Record<string, unknown> | undefined;
        const rows = cfg.rows ?? nestedConfig?.rows;
        if (Array.isArray(rows)) {
            return this.loadCsvFromRows(rows, hasHeader);
        }

        // Priority 3: csvText - inline string
        if (typeof cfg.csvText === 'string') {
            return parseCsv(cfg.csvText, delimiter, hasHeader) as RecordObject[];
        }


        throw new FileExtractionError(`CSV extractor step ${stepKey} has no configured data source`);
    }

    private async loadCsvFromUpload(
        ctx: ExtractHandlerContext['ctx'],
        fileId: string,
        stepKey: string,
        delimiter: string,
        hasHeader: boolean,
    ): Promise<RecordObject[]> {
        try {
            const content = await this.fileStorageService.readFileAsString(ctx, fileId);
            if (content === null || content === undefined) {
                throw new FileExtractionError(`Uploaded CSV file not found: ${fileId}`);
            }
            const records = parseCsv(content, delimiter, hasHeader);
            this.logger.debug('Extracted records from uploaded file', { stepKey, fileId, count: records.length });
            return records as RecordObject[];
        } catch (err) {
            if (err instanceof FileExtractionError) throw err;
            this.logger.warn('Failed to read uploaded CSV file', {
                stepKey,
                fileId,
                error: getErrorMessage(err),
            });
            throw new FileExtractionError(`Failed to read uploaded CSV file for step ${stepKey}`);
        }
    }

    private loadCsvFromRows(rows: unknown[], hasHeader: boolean): RecordObject[] {
        if (rows.length === 0) return [];

        if (hasHeader && Array.isArray(rows[0])) {
            const header = rows[0] as string[];
            return rows.slice(1).map(r => arrayToObject(header, r as JsonValue[])) as RecordObject[];
        }

        return rows as RecordObject[];
    }


    async extractJson(context: ExtractHandlerContext): Promise<RecordObject[]> {
        const { step, executorCtx } = context;
        const cfg = getExtractConfig<JsonExtractConfig>(step);
        const resetCheckpoint = (cfg as Record<string, unknown>).resetCheckpoint === true;
        const offset = resetCheckpoint ? 0 : getCheckpointValue(executorCtx, step.key, 'offset', 0);

        const data = await this.loadJsonData(context.ctx, cfg, step.key);
        if (data === null) {
            throw new FileExtractionError(`JSON extractor step ${step.key} has no configured data source`);
        }

        const items = this.extractJsonItems(data, cfg.itemsPath);
        this.logger.debug('Extracted JSON records', { stepKey: step.key, count: items.length });

        return this.applyOffsetAndCheckpoint(items, offset, executorCtx, step.key);
    }

    private async loadJsonData(ctx: ExtractHandlerContext['ctx'], cfg: JsonExtractConfig, stepKey: string): Promise<unknown | null> {
        // Priority 1: fileId - uploaded file
        if (cfg.fileId) {
            return this.loadJsonFromUpload(ctx, cfg.fileId, stepKey);
        }

        // Priority 2: jsonText - inline string
        if (typeof cfg.jsonText === 'string') {
            return this.parseJsonSafe(cfg.jsonText, stepKey, 'inline JSON');
        }


        return null;
    }

    private async loadJsonFromUpload(ctx: ExtractHandlerContext['ctx'], fileId: string, stepKey: string): Promise<unknown | null> {
        try {
            const content = await this.fileStorageService.readFileAsString(ctx, fileId);
            if (content === null || content === undefined) {
                throw new FileExtractionError(`Uploaded JSON file not found: ${fileId}`);
            }
            const data = JSON.parse(content);
            this.logger.debug('Parsed JSON from uploaded file', { stepKey, fileId });
            return data;
        } catch (err) {
            if (err instanceof FileExtractionError) throw err;
            this.logger.warn('Failed to read or parse uploaded JSON file', {
                stepKey,
                fileId,
                error: getErrorMessage(err),
            });
            throw new FileExtractionError(
                `Failed to read or parse uploaded JSON file for step ${stepKey}`,
            );
        }
    }


    private parseJsonSafe(content: string, stepKey: string, source: string): unknown {
        try {
            return JSON.parse(content);
        } catch (err) {
            this.logger.warn(`Failed to parse ${source}`, {
                stepKey,
                error: getErrorMessage(err),
            });
            throw new FileExtractionError(`Failed to parse ${source} for step ${stepKey}`);
        }
    }

    private extractJsonItems(data: unknown, itemsPath?: string): RecordObject[] {
        const dataObj = data as RecordObject | null | undefined;
        if (itemsPath && dataObj) {
            const extracted = getPath(dataObj, itemsPath);
            if (Array.isArray(extracted)) return extracted as RecordObject[];
            if (extracted != null) return [extracted] as RecordObject[];
            return [];
        }

        if (Array.isArray(data)) return data as RecordObject[];
        if (typeof data === 'object' && data !== null) return [data] as RecordObject[];

        return [];
    }

    async extractXml(context: ExtractHandlerContext): Promise<RecordObject[]> {
        const { step, executorCtx } = context;
        const cfg = getExtractConfig<XmlExtractConfig>(step);
        const resetCheckpoint = (cfg as Record<string, unknown>).resetCheckpoint === true;
        const offset = resetCheckpoint ? 0 : getCheckpointValue(executorCtx, step.key, 'offset', 0);

        const content = await this.loadXmlContent(context.ctx, cfg, step.key);
        if (!content) {
            throw new FileExtractionError(`XML extractor step ${step.key} has no valid data source`);
        }

        const result = parseXml(content, {
            recordPath: cfg.recordPath,
            attributePrefix: cfg.attributePrefix,
        });

        if (!result.success) {
            this.logger.warn('XML parsing failed', { stepKey: step.key, errors: result.errors });
            throw new FileExtractionError(`Failed to parse XML for step ${step.key}`);
        }

        this.logger.debug('Extracted XML records', { stepKey: step.key, count: result.records.length });
        return this.applyOffsetAndCheckpoint(result.records as RecordObject[], offset, executorCtx, step.key);
    }

    private async loadXmlContent(ctx: ExtractHandlerContext['ctx'], cfg: XmlExtractConfig, stepKey: string): Promise<string | null> {
        if (cfg.fileId) {
            try {
                const content = await this.fileStorageService.readFileAsString(ctx, cfg.fileId);
                if (content === null || content === undefined) {
                    throw new FileExtractionError(`Uploaded XML file not found: ${cfg.fileId}`);
                }
                return content;
            } catch (err) {
                if (err instanceof FileExtractionError) throw err;
                this.logger.warn('Failed to read uploaded XML file', { stepKey, fileId: cfg.fileId, error: getErrorMessage(err) });
                throw new FileExtractionError(`Failed to read uploaded XML file for step ${stepKey}`);
            }
        }

        if (typeof cfg.xmlText === 'string') {
            return cfg.xmlText;
        }


        return null;
    }

    async extractXlsx(context: ExtractHandlerContext): Promise<RecordObject[]> {
        const { step, executorCtx } = context;
        const cfg = getExtractConfig<XlsxExtractConfig>(step);
        const resetCheckpoint = (cfg as Record<string, unknown>).resetCheckpoint === true;
        const offset = resetCheckpoint ? 0 : getCheckpointValue(executorCtx, step.key, 'offset', 0);
        const content = await this.loadXlsxContent(context.ctx, cfg, step.key);
        if (!content || content.length === 0) {
            throw new FileExtractionError(`XLSX extractor step ${step.key} has no valid data source`);
        }

        const sheet = typeof cfg.sheetName === 'string' && /^\d+$/.test(cfg.sheetName)
            ? Number(cfg.sheetName)
            : cfg.sheetName;
        const result = await this.fileParserService.parse(content, {
            format: 'XLSX',
            xlsx: {
                sheet,
                header: cfg.hasHeader !== false,
                preview: executorCtx.recordLimit,
            },
        });
        if (!result.success) {
            this.logger.warn('XLSX parsing failed', { stepKey: step.key, errors: result.errors });
            throw new FileExtractionError(`Failed to parse XLSX for step ${step.key}`);
        }
        return this.applyOffsetAndCheckpoint(result.records as RecordObject[], offset, executorCtx, step.key);
    }

    private async loadXlsxContent(ctx: ExtractHandlerContext['ctx'], cfg: XlsxExtractConfig, stepKey: string): Promise<Buffer | null> {
        if (!cfg.fileId) {
            return null;
        }
        try {
            const content = await this.fileStorageService.readFile(ctx, cfg.fileId);
            if (content === null || content === undefined) {
                throw new FileExtractionError(`Uploaded XLSX file not found: ${cfg.fileId}`);
            }
            return content;
        } catch (error) {
            if (error instanceof FileExtractionError) throw error;
            this.logger.warn('Failed to read uploaded XLSX file', {
                stepKey,
                fileId: cfg.fileId,
                error: getErrorMessage(error),
            });
            throw new FileExtractionError(`Failed to read uploaded XLSX file for step ${stepKey}`);
        }
    }

    private applyOffsetAndCheckpoint(
        records: RecordObject[],
        offset: number,
        executorCtx: ExecutorContext,
        stepKey: string,
    ): RecordObject[] {
        const sliced = records.slice(Math.max(0, offset));
        updateCheckpoint(executorCtx, stepKey, { offset: offset + sliced.length });
        return sliced;
    }
}
