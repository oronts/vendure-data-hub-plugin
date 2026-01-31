import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import * as fs from 'fs';
import * as pathLib from 'path';
import { JsonValue, JsonObject, PipelineStepDefinition, PipelineContext } from '../../types/index';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { RecordObject, OnRecordErrorCallback, ExecutionResult, ExecutorContext } from '../executor-types';
import { getPath, setPath, recordsToCsv, chunk, sleep, ensureDirectoryExists, deepClone } from '../utils';
import { DEFAULTS, LOGGER_CONTEXTS, HTTP, FILE_STORAGE, TRUNCATION, HttpMethod, EXPORTER_CODE, HTTP_HEADERS, CONTENT_TYPES, AUTH_SCHEMES } from '../../constants/index';
import { FileFormat } from '../../constants/enums';
import { ExportConfig } from '../config-types';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { ExporterAdapter, ExportContext, ConnectionConfig, ConnectionType } from '../../sdk/types';
import { formatDate } from '../../transforms/field/date-transforms';
import { getAdapterCode } from '../../types/step-configs';

/**
 * Resolve output file path from directory path and filename pattern
 */
function resolveOutputPath(basePath: string, filenamePattern?: string, defaultFilename?: string): string {
    // If basePath already looks like a file (has extension), use it directly
    const ext = pathLib.extname(basePath);
    if (ext && ext.length > 1 && ext.length < 6) {
        return basePath;
    }

    // basePath is a directory - combine with filename
    let filename = filenamePattern || defaultFilename || 'export.csv';

    // Process filename pattern placeholders
    const now = new Date();
    filename = filename
        .replace(/\$\{date:([^}]+)\}/g, (_match, format: string) => {
            return formatDate(now, format);
        })
        .replace(/\$\{timestamp\}/g, String(Date.now()))
        .replace(/\$\{uuid\}/g, crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);

    return pathLib.join(basePath, filename);
}

/**
 * Common export configuration fields
 */
interface BaseExportCfg {
    adapterCode?: string;
    fields?: string[];
    excludeFields?: string[];
    fieldMapping?: Record<string, string>;
    /** Output file path (canonical field name) */
    path?: string;
}

interface RetryOptions {
    retries: number;
    retryDelayMs: number;
    maxRetryDelayMs: number;
    backoffMultiplier: number;
}

function resolveRetryOptions(stepCfg: Record<string, JsonValue> | undefined): RetryOptions {
    const cfg = stepCfg ?? {};
    const retries = Math.max(0, Number(cfg.retries ?? 0) || 0);
    const retryDelayMs = Math.max(0, Number(cfg.retryDelayMs ?? 0) || 0);
    const maxRetryDelayMs = Math.max(0, Number(cfg.maxRetryDelayMs ?? HTTP.RETRY_MAX_DELAY_MS) || HTTP.RETRY_MAX_DELAY_MS);
    const backoffMultiplier = Math.max(1, Number(cfg.backoffMultiplier ?? HTTP.BACKOFF_MULTIPLIER) || HTTP.BACKOFF_MULTIPLIER);
    return {
        retries,
        retryDelayMs,
        maxRetryDelayMs,
        backoffMultiplier,
    };
}

async function executeWithRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions,
    logger: DataHubLogger,
): Promise<T | null> {
    let attempt = 0;
    let delay = options.retryDelayMs;
    let lastError: unknown;
    while (attempt <= options.retries) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            logger.warn('Export attempt failed', {
                attempt,
                retries: options.retries,
                error: error instanceof Error ? error.message : String(error),
            });
        }
        attempt++;
        if (attempt <= options.retries && delay > 0) {
            await sleep(Math.min(delay, options.maxRetryDelayMs));
            delay = Math.min(delay * options.backoffMultiplier, options.maxRetryDelayMs);
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Export failed'));
}

@Injectable()
export class ExportExecutor {
    private readonly logger: DataHubLogger;

    constructor(
        private secretService: SecretService,
        private connectionService: ConnectionService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXPORT_EXECUTOR);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        pipelineContext?: PipelineContext,
        executorCtx?: ExecutorContext,
    ): Promise<ExecutionResult> {
        const cfg = step.config as BaseExportCfg;
        const adapterCode = getAdapterCode(step) || undefined;
        const startTime = Date.now();
        let ok = 0;
        let fail = 0;

        this.logger.debug(`Executing export step`, {
            stepKey: step.key,
            adapterCode,
            recordCount: input.length,
        });

        // Apply field selection/mapping
        const fields = cfg.fields;
        const excludeFields = cfg.excludeFields;
        const fieldMapping = cfg.fieldMapping;

        const prepareRecord = (rec: RecordObject): RecordObject => {
            let result: RecordObject = rec;
            if (fields && fields.length > 0) {
                const picked: RecordObject = {};
                for (const f of fields) {
                    const val = getPath(rec, f);
                    if (val !== undefined) setPath(picked, f, val);
                }
                result = picked;
            } else if (excludeFields && excludeFields.length > 0) {
                result = deepClone(rec);
                for (const f of excludeFields) {
                    delete result[f];
                }
            }
            if (fieldMapping) {
                const mapped: RecordObject = {};
                for (const [from, to] of Object.entries(fieldMapping)) {
                    const val = getPath(result, from);
                    if (val !== undefined) setPath(mapped, to, val);
                }
                result = { ...result, ...mapped };
            }
            return result;
        };

        switch (adapterCode) {
            case EXPORTER_CODE.CSV: {
                try {
                    const csvCfg = step.config as Record<string, JsonValue>;
                    const basePath = (csvCfg.path as string) ?? FILE_STORAGE.TEMP_DIR;
                    const filenamePattern = csvCfg.filenamePattern as string | undefined;
                    const outputPath = resolveOutputPath(basePath, filenamePattern, 'export.csv');
                    const delimiter = (csvCfg.delimiter as string) ?? ',';
                    const includeHeader = csvCfg.includeHeader !== false;
                    const records = input.map(prepareRecord);
                    const csv = recordsToCsv(records, delimiter, includeHeader);
                    ensureDirectoryExists(outputPath);
                    await fs.promises.writeFile(outputPath, csv, 'utf-8');
                    this.logger.info(`CSV export complete`, { outputPath, recordCount: records.length });
                    ok = records.length;
                } catch (e: unknown) {
                    fail = input.length;
                    const message = e instanceof Error ? e.message : 'CSV export failed';
                    if (onRecordError) await onRecordError(step.key, message, {});
                }
                break;
            }
            case EXPORTER_CODE.JSON: {
                try {
                    const jsonCfg = step.config as Record<string, JsonValue>;
                    const basePath = (jsonCfg.path as string) ?? FILE_STORAGE.TEMP_DIR;
                    const filenamePattern = jsonCfg.filenamePattern as string | undefined;
                    const outputPath = resolveOutputPath(basePath, filenamePattern, 'export.json');
                    const format = (jsonCfg.format as string) ?? 'json';
                    const records = input.map(prepareRecord);
                    let content: string;
                    if (format === FileFormat.NDJSON || format === 'jsonl') {
                        content = records.map(r => JSON.stringify(r)).join('\n');
                    } else {
                        const pretty = jsonCfg.pretty !== false;
                        content = JSON.stringify(records, null, pretty ? 2 : undefined);
                    }
                    ensureDirectoryExists(outputPath);
                    await fs.promises.writeFile(outputPath, content, 'utf-8');
                    this.logger.info(`JSON export complete`, { outputPath, recordCount: records.length });
                    ok = records.length;
                } catch (e: unknown) {
                    fail = input.length;
                    const message = e instanceof Error ? e.message : 'JSON export failed';
                    if (onRecordError) await onRecordError(step.key, message, {});
                }
                break;
            }
            case EXPORTER_CODE.XML: {
                try {
                    const xmlCfg = step.config as Record<string, JsonValue>;
                    const basePath = (xmlCfg.path as string) ?? FILE_STORAGE.TEMP_DIR;
                    const filenamePattern = xmlCfg.filenamePattern as string | undefined;
                    const outputPath = resolveOutputPath(basePath, filenamePattern, 'export.xml');
                    const rootElement = (xmlCfg.rootElement as string) ?? 'records';
                    const itemElement = (xmlCfg.itemElement as string) ?? 'record';
                    const declaration = xmlCfg.declaration !== false;
                    const records = input.map(prepareRecord);
                    let xml = declaration ? '<?xml version="1.0" encoding="UTF-8"?>\n' : '';
                    xml += `<${rootElement}>\n`;
                    for (const rec of records) {
                        xml += `  <${itemElement}>\n`;
                        for (const [k, v] of Object.entries(rec)) {
                            const escaped = String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            xml += `    <${k}>${escaped}</${k}>\n`;
                        }
                        xml += `  </${itemElement}>\n`;
                    }
                    xml += `</${rootElement}>`;
                    ensureDirectoryExists(outputPath);
                    await fs.promises.writeFile(outputPath, xml, 'utf-8');
                    this.logger.info(`XML export complete`, { outputPath, recordCount: records.length });
                    ok = records.length;
                } catch (e: unknown) {
                    fail = input.length;
                    const message = e instanceof Error ? e.message : 'XML export failed';
                    if (onRecordError) await onRecordError(step.key, message, {});
                }
                break;
            }
            case EXPORTER_CODE.REST_POST:
            case EXPORTER_CODE.WEBHOOK: {
                const webhookCfg = step.config as Record<string, JsonValue>;
                const endpoint = webhookCfg.url as string | undefined;
                const method = ((webhookCfg.method as string) ?? HttpMethod.POST).toUpperCase();
                const headers = (webhookCfg.headers as Record<string, string>) ?? {};
                const batchSize = Number(webhookCfg.batchSize ?? DEFAULTS.BULK_SIZE) || DEFAULTS.BULK_SIZE;
                const records = input.map(prepareRecord);
                const retryOptions = resolveRetryOptions(webhookCfg);
                const timeoutMs = Math.max(0, Number(webhookCfg.timeoutMs ?? 0) || 0);

                if (!endpoint) {
                    fail = records.length;
                    if (onRecordError) {
                        await onRecordError(step.key, 'Export endpoint is not configured', {});
                    }
                    break;
                }

                // Get auth headers from secrets
                const bearerSecret = webhookCfg.bearerTokenSecretCode as string | undefined;
                const basicSecret = webhookCfg.basicSecretCode as string | undefined;
                const finalHeaders: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON, ...headers };

                if (bearerSecret) {
                    try {
                        const token = await this.secretService.resolve(ctx, bearerSecret);
                        if (token) finalHeaders[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${token}`;
                    } catch (error) {
                        this.logger.warn('Failed to resolve bearer token secret for webhook export', {
                            stepKey: step.key,
                            endpoint,
                            error: (error as Error)?.message,
                        });
                    }
                }
                if (basicSecret) {
                    try {
                        const creds = await this.secretService.resolve(ctx, basicSecret);
                        if (creds) finalHeaders[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BASIC} ${Buffer.from(creds).toString('base64')}`;
                    } catch (error) {
                        this.logger.warn('Failed to resolve basic auth secret for webhook export', {
                            stepKey: step.key,
                            endpoint,
                            error: (error as Error)?.message,
                        });
                    }
                }

                const batches = chunk(records, batchSize);
                for (const batch of batches) {
                    const payload = JSON.stringify(batch);
                    try {
                        await executeWithRetry(
                            async () => {
                                const controller = timeoutMs > 0 ? new AbortController() : undefined;
                                let timer: NodeJS.Timeout | undefined;
                                try {
                                    if (controller && timeoutMs > 0) {
                                        timer = setTimeout(() => controller.abort(), timeoutMs);
                                    }
                                    const response = await fetch(endpoint, {
                                        method,
                                        headers: finalHeaders,
                                        body: payload,
                                        signal: controller?.signal,
                                    });
                                    // Always consume response body to prevent memory leaks
                                    const bodyText = await response.text().catch(() => '');
                                    if (!response.ok) {
                                        throw new Error(`HTTP ${response.status}: ${response.statusText}${bodyText ? ` - ${bodyText.slice(0, TRUNCATION.ERROR_MESSAGE_MAX_LENGTH)}` : ''}`);
                                    }
                                } finally {
                                    if (timer) clearTimeout(timer);
                                }
                            },
                            retryOptions,
                            this.logger,
                        );
                        ok += batch.length;
                    } catch (e: unknown) {
                        fail += batch.length;
                        const message = e instanceof Error ? e.message : 'Webhook export failed';
                        if (onRecordError) {
                            await onRecordError(step.key, message, {});
                        }
                    }
                }
                break;
            }
            default: {
                // Try custom exporters from registry
                if (adapterCode && this.registry) {
                    const customExporter = this.registry.getRuntime('exporter', adapterCode) as ExporterAdapter<any> | undefined;
                    if (customExporter && typeof customExporter.export === 'function') {
                        const result = await this.executeCustomExporter(ctx, step, input, customExporter, pipelineContext, executorCtx);
                        ok = result.ok;
                        fail = result.fail;
                        break;
                    }
                }
                // Unknown adapter - treat as no-op success
                this.logger.warn(`Unknown export adapter`, { stepKey: step.key, adapterCode });
                ok = input.length;
                break;
            }
        }

        this.logOperationResult(adapterCode ?? 'unknown', 'export', ok, fail, startTime, step.key);

        return { ok, fail };
    }

    private logOperationResult(adapterCode: string, operation: string, ok: number, fail: number, startTime: number, stepKey: string): void {
        const durationMs = Date.now() - startTime;
        this.logger.logExporterOperation(adapterCode, operation, ok, fail, durationMs, { stepKey });
    }

    /**
     * Execute a custom exporter adapter from the registry
     */
    private async executeCustomExporter(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        exporter: ExporterAdapter<any>,
        pipelineContext?: PipelineContext,
        executorCtx?: ExecutorContext,
    ): Promise<ExecutionResult> {
        const cfg = step.config as JsonObject & { incremental?: boolean };

        const exportContext: ExportContext = {
            ctx,
            pipelineId: '0',
            stepKey: step.key,
            pipelineContext: pipelineContext ?? {} as PipelineContext,
            secrets: {
                get: async (code: string) => {
                    const secret = await this.secretService.getByCode(ctx, code);
                    return secret?.value ?? undefined;
                },
                getRequired: async (code: string) => {
                    const secret = await this.secretService.getByCode(ctx, code);
                    if (!secret?.value) throw new Error(`Secret not found: ${code}`);
                    return secret.value;
                },
            },
            connections: {
                get: async (code: string) => {
                    const conn = await this.connectionService.getByCode(ctx, code);
                    if (!conn) return undefined;
                    return {
                        code: conn.code,
                        type: conn.type as ConnectionType,
                        ...conn.config,
                    } as ConnectionConfig;
                },
                getRequired: async (code: string) => {
                    const conn = await this.connectionService.getByCode(ctx, code);
                    if (!conn) throw new Error(`Connection not found: ${code}`);
                    return {
                        code: conn.code,
                        type: conn.type as ConnectionType,
                        ...conn.config,
                    } as ConnectionConfig;
                },
            },
            logger: {
                info: (msg: string, meta?: JsonObject) => this.logger.info(msg, meta),
                warn: (msg: string, meta?: JsonObject) => this.logger.warn(msg, meta),
                error: (msg: string, errorOrMeta?: Error | JsonObject, meta?: JsonObject) => {
                    if (errorOrMeta instanceof Error) {
                        this.logger.error(msg, errorOrMeta, meta);
                    } else {
                        this.logger.error(msg, undefined, errorOrMeta);
                    }
                },
                debug: (msg: string, meta?: JsonObject) => this.logger.debug(msg, meta),
            },
            dryRun: false,
            incremental: cfg?.incremental ?? false,
            checkpoint: executorCtx?.cpData?.[step.key] ?? {},
            setCheckpoint: (data: JsonObject) => {
                if (executorCtx?.cpData) {
                    executorCtx.cpData[step.key] = data;
                    executorCtx.markCheckpointDirty();
                }
            },
        };

        try {
            const result = await exporter.export(exportContext, cfg, input as readonly JsonObject[]);
            return {
                ok: result.succeeded,
                fail: result.failed,
            };
        } catch (error) {
            this.logger.error(`Custom exporter failed`, error instanceof Error ? error : undefined, {
                adapterCode: exporter.code,
                stepKey: step.key,
            });
            return { ok: 0, fail: input.length };
        }
    }
}
