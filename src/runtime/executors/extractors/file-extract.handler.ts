/**
 * File Extract Handler
 *
 * Handles extraction of records from file sources:
 * - CSV files (uploaded, inline text, or local path)
 * - JSON files (uploaded, inline text, or local path)
 * - XML files (future support)
 *
 * @module runtime/executors/extractors
 */

import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { RecordObject, ExecutorContext } from '../../executor-types';
import { FileStorageService } from '../../../services/storage/file-storage.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';
import { parseCsv, arrayToObject, getPath } from '../../utils';
import { LOGGER_CONTEXTS } from '../../../constants/index';
import { JsonValue } from '../../../types/index';
import {
    ExtractHandler,
    ExtractHandlerContext,
    getExtractConfig,
    updateCheckpoint,
    getCheckpointValue,
} from './extract-handler.interface';
import { FileFormat } from '../../../constants/enums';

interface CsvExtractConfig {
    adapterCode?: string;
    fileId?: string;
    csvText?: string;
    csvPath?: string;
    rows?: unknown[];
    delimiter?: string;
    hasHeader?: boolean;
}

interface JsonExtractConfig {
    adapterCode?: string;
    fileId?: string;
    jsonText?: string;
    jsonPath?: string;
    itemsPath?: string;
}

@Injectable()
export class FileExtractHandler implements ExtractHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private fileStorageService: FileStorageService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXTRACT_EXECUTOR);
    }

    async extract(context: ExtractHandlerContext): Promise<RecordObject[]> {
        const { step } = context;
        const cfg = getExtractConfig<CsvExtractConfig | JsonExtractConfig>(step);
        const adapterCode = cfg.adapterCode;

        if (adapterCode === FileFormat.CSV) {
            return this.extractCsv(context);
        }
        if (adapterCode === FileFormat.JSON) {
            return this.extractJson(context);
        }

        this.logger.warn('Unknown file extractor type', { stepKey: step.key, adapterCode });
        return [];
    }

    async extractCsv(context: ExtractHandlerContext): Promise<RecordObject[]> {
        const { step, executorCtx } = context;
        const cfg = getExtractConfig<CsvExtractConfig>(step);

        const delimiter = cfg.delimiter ?? ',';
        const hasHeader = cfg.hasHeader !== false;
        const offset = getCheckpointValue(executorCtx, step.key, 'offset', 0);

        const records = await this.loadCsvRecords(cfg, step.key, delimiter, hasHeader);
        return this.applyOffsetAndCheckpoint(records, offset, executorCtx, step.key);
    }

    private async loadCsvRecords(
        cfg: CsvExtractConfig,
        stepKey: string,
        delimiter: string,
        hasHeader: boolean,
    ): Promise<RecordObject[]> {
        // Priority 1: fileId - uploaded file
        if (cfg.fileId) {
            return this.loadCsvFromUpload(cfg.fileId, stepKey, delimiter, hasHeader);
        }

        // Priority 2: rows - inline array
        if (Array.isArray(cfg.rows)) {
            return this.loadCsvFromRows(cfg.rows, hasHeader);
        }

        // Priority 3: csvText - inline string
        if (typeof cfg.csvText === 'string') {
            return parseCsv(cfg.csvText, delimiter, hasHeader) as RecordObject[];
        }

        // Priority 4: csvPath - local file
        if (cfg.csvPath) {
            return this.loadCsvFromPath(cfg.csvPath, stepKey, delimiter, hasHeader);
        }

        return [];
    }

    private async loadCsvFromUpload(
        fileId: string,
        stepKey: string,
        delimiter: string,
        hasHeader: boolean,
    ): Promise<RecordObject[]> {
        try {
            const content = await this.fileStorageService.readFileAsString(fileId);
            if (!content) {
                this.logger.warn('Uploaded file not found or empty', { stepKey, fileId });
                return [];
            }
            const records = parseCsv(content, delimiter, hasHeader);
            this.logger.debug('Extracted records from uploaded file', { stepKey, fileId, count: records.length });
            return records as RecordObject[];
        } catch (err) {
            this.logger.warn('Failed to read uploaded file', {
                stepKey,
                fileId,
                error: err instanceof Error ? err.message : String(err),
            });
            return [];
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

    private async loadCsvFromPath(
        csvPath: string,
        stepKey: string,
        delimiter: string,
        hasHeader: boolean,
    ): Promise<RecordObject[]> {
        try {
            await fs.promises.access(csvPath);
            const content = await fs.promises.readFile(csvPath, 'utf8');
            return parseCsv(content, delimiter, hasHeader) as RecordObject[];
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
                this.logger.warn('Failed to parse CSV file', {
                    stepKey,
                    path: csvPath,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            return [];
        }
    }

    async extractJson(context: ExtractHandlerContext): Promise<RecordObject[]> {
        const { step, executorCtx } = context;
        const cfg = getExtractConfig<JsonExtractConfig>(step);
        const offset = getCheckpointValue(executorCtx, step.key, 'offset', 0);

        const data = await this.loadJsonData(cfg, step.key);
        if (data === null) {
            this.logger.warn('JSON extractor: no data source provided', { stepKey: step.key });
            return [];
        }

        const items = this.extractJsonItems(data, cfg.itemsPath);
        this.logger.debug('Extracted JSON records', { stepKey: step.key, count: items.length });

        return this.applyOffsetAndCheckpoint(items, offset, executorCtx, step.key);
    }

    private async loadJsonData(cfg: JsonExtractConfig, stepKey: string): Promise<unknown | null> {
        // Priority 1: fileId - uploaded file
        if (cfg.fileId) {
            return this.loadJsonFromUpload(cfg.fileId, stepKey);
        }

        // Priority 2: jsonText - inline string
        if (typeof cfg.jsonText === 'string') {
            return this.parseJsonSafe(cfg.jsonText, stepKey, 'inline JSON');
        }

        // Priority 3: jsonPath - local file
        if (cfg.jsonPath) {
            return this.loadJsonFromPath(cfg.jsonPath, stepKey);
        }

        return null;
    }

    private async loadJsonFromUpload(fileId: string, stepKey: string): Promise<unknown | null> {
        try {
            const content = await this.fileStorageService.readFileAsString(fileId);
            if (!content) {
                this.logger.warn('Uploaded JSON file not found or empty', { stepKey, fileId });
                return null;
            }
            const data = JSON.parse(content);
            this.logger.debug('Parsed JSON from uploaded file', { stepKey, fileId });
            return data;
        } catch (err) {
            this.logger.warn('Failed to read/parse uploaded JSON file', {
                stepKey,
                fileId,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    }

    private async loadJsonFromPath(jsonPath: string, stepKey: string): Promise<unknown | null> {
        try {
            await fs.promises.access(jsonPath);
            const content = await fs.promises.readFile(jsonPath, 'utf8');
            const data = JSON.parse(content);
            this.logger.debug('Parsed JSON from file path', { stepKey, jsonPath });
            return data;
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
                this.logger.warn('Failed to read/parse JSON file', {
                    stepKey,
                    path: jsonPath,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            return null;
        }
    }

    private parseJsonSafe(content: string, stepKey: string, source: string): unknown | null {
        try {
            return JSON.parse(content);
        } catch (err) {
            this.logger.warn(`Failed to parse ${source}`, {
                stepKey,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    }

    private extractJsonItems(data: unknown, itemsPath?: string): RecordObject[] {
        const dataObj = data as RecordObject | null | undefined;
        if (itemsPath && dataObj) {
            const extracted = getPath(dataObj, itemsPath);
            if (Array.isArray(extracted)) return extracted as RecordObject[];
            if (extracted !== null && extracted !== undefined) return [extracted] as RecordObject[];
            return [];
        }

        if (Array.isArray(data)) return data as RecordObject[];
        if (typeof data === 'object' && data !== null) return [data] as RecordObject[];

        return [];
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
