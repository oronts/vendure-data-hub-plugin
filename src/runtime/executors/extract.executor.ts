import { Injectable, Optional } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { JsonObject, PipelineStepDefinition } from '../../types/index';
// Direct imports to avoid circular dependencies
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { FileStorageService } from '../../services/storage/file-storage.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { RecordObject, OnRecordErrorCallback, ExecutorContext } from '../executor-types';
import { parseCsv, arrayToObject, getPath, sleep } from '../utils';
import { DEFAULTS, TIME, LOGGER_CONTEXTS, HTTP } from '../../constants/index';
import { ConnectionAuthType } from '../../sdk/types/connection-types';
import { getEntityClass, entityToRecord, EntityLike } from '../../extractors/vendure-query/helpers';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { ExtractorAdapter, ExtractContext, RecordEnvelope } from '../../sdk/types';
interface StoredHttpAuthConfig {
    type: ConnectionAuthType;
    headerName?: string;
    secretCode?: string;
    username?: string;
    usernameSecretCode?: string;
}

interface NormalizedHttpConnectionConfig {
    baseUrl?: string;
    timeout?: number;
    headers?: Record<string, string>;
    auth?: StoredHttpAuthConfig;
}

@Injectable()
export class ExtractExecutor {
    private readonly logger: DataHubLogger;

    private readonly impls: Record<string, (ctx: RequestContext, step: PipelineStepDefinition, executorCtx: ExecutorContext, onRecordError?: OnRecordErrorCallback) => Promise<RecordObject[]>>;

    constructor(
        private secretService: SecretService,
        private connectionService: ConnectionService,
        private connection: TransactionalConnection,
        private fileStorageService: FileStorageService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXTRACT_EXECUTOR);
        this.impls = {
            rest: (ctx, step, ex, onErr) => this.extractRest(ctx, step, ex, onErr),
            csv: (_ctx, step, ex) => this.extractCsv(step, ex),
            json: (_ctx, step, ex) => this.extractJson(step, ex),
            graphql: (ctx, step, ex, onErr) => this.extractGraphql(ctx, step, ex, onErr),
            'vendure-query': (ctx, step, ex, onErr) => this.extractVendureQuery(ctx, step, ex, onErr),
            inMemory: (_ctx, step) => this.extractInMemory(step),
            generator: (_ctx, step) => this.extractGenerator(step),
        };
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        onRecordError?: OnRecordErrorCallback,
    ): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;
        const adapterCode = (cfg as any)?.adapterCode as string | undefined;
        const startTime = Date.now();

        this.logger.debug(`Executing extract step`, { stepKey: step.key, adapterCode });

        // Try built-in extractors first
        const impl = adapterCode ? this.impls[adapterCode] : undefined;
        if (impl) {
            const result = await impl(ctx, step, executorCtx, onRecordError);
            const durationMs = Date.now() - startTime;
            this.logger.logExtractorOperation(adapterCode ?? 'unknown', result.length, durationMs, { stepKey: step.key });
            return result;
        }

        // Try custom extractors from registry
        if (adapterCode && this.registry) {
            const customExtractor = this.registry.getRuntime('extractor', adapterCode) as ExtractorAdapter<any> | undefined;
            if (customExtractor && typeof customExtractor.extract === 'function') {
                const result = await this.executeCustomExtractor(ctx, step, executorCtx, customExtractor, onRecordError);
                const durationMs = Date.now() - startTime;
                this.logger.logExtractorOperation(adapterCode, result.length, durationMs, { stepKey: step.key });
                return result;
            }
        }

        const errorMsg = `Unknown extractor adapter: ${adapterCode ?? '(none)'}`;
        this.logger.warn(errorMsg, { adapterCode, stepKey: step.key });
        if (onRecordError) {
            await onRecordError(step.key, errorMsg, { adapterCode: adapterCode ?? 'unknown' });
        }
        const durationMs = Date.now() - startTime;
        this.logger.logExtractorOperation(adapterCode ?? 'unknown', 0, durationMs, { stepKey: step.key });
        return [];
    }

    /**
     * Execute a custom extractor adapter from the registry
     */
    private async executeCustomExtractor(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        extractor: ExtractorAdapter<any>,
        onRecordError?: OnRecordErrorCallback,
    ): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;

        // Create extract context for the custom extractor
        const extractContext: ExtractContext = {
            ctx,
            pipelineId: '0',
            stepKey: step.key,
            checkpoint: executorCtx.cpData?.[step.key] ?? {},
            logger: {
                info: (msg: string, meta?: any) => this.logger.info(msg, meta),
                warn: (msg: string, meta?: any) => this.logger.warn(msg, meta),
                error: (msg: string, meta?: any) => this.logger.error(msg, undefined, meta),
                debug: (msg: string, meta?: any) => this.logger.debug(msg, meta),
            },
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
                    return conn?.config as any;
                },
                getRequired: async (code: string) => {
                    const conn = await this.connectionService.getByCode(ctx, code);
                    if (!conn) throw new Error(`Connection not found: ${code}`);
                    return conn.config as any;
                },
            },
            setCheckpoint: (data: any) => {
                if (executorCtx.cpData) {
                    executorCtx.cpData[step.key] = data;
                    executorCtx.markCheckpointDirty();
                }
            },
        };

        // Collect records from async generator
        const records: RecordObject[] = [];
        try {
            for await (const envelope of extractor.extract(extractContext, cfg)) {
                records.push(envelope.data as RecordObject);
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error(`Custom extractor failed: ${errorMsg}`, error instanceof Error ? error : undefined, {
                adapterCode: extractor.code,
                stepKey: step.key,
            });
            // Report error via callback if provided (for dry run error tracking)
            if (onRecordError) {
                await onRecordError(step.key, `Custom extractor failed: ${errorMsg}`, { adapterCode: extractor.code } as any);
            }
        }

        return records;
    }

    private async extractCsv(
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
    ): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;
        const fileId = (cfg as any)?.fileId as string | undefined;
        const text = (cfg as any)?.csvText as string | undefined;
        const rows = (cfg as any)?.rows as any[] | undefined;
        const csvPath = (cfg as any)?.csvPath as string | undefined;
        const delimiter = ((cfg as any)?.delimiter as string | undefined) ?? ',';
        const hasHeader = (cfg as any)?.hasHeader !== false;

        // Helper to apply offset for checkpoint resume (checkpoint is cleared at pipeline start for fresh runs)
        const applyOffset = (records: any[], storedOffset: number): any[] => {
            const sliced = records.slice(Math.max(0, storedOffset));
            if (executorCtx.cpData) {
                executorCtx.cpData[step.key] = { ...(executorCtx.cpData[step.key] ?? {}), offset: storedOffset + sliced.length };
                executorCtx.markCheckpointDirty();
            }
            return sliced;
        };

        const offset = executorCtx.cpData?.[step.key]?.offset ?? 0;

        // Priority 1: fileId - read from uploaded file storage
        if (fileId) {
            try {
                const content = await this.fileStorageService.readFileAsString(fileId);
                if (!content) {
                    this.logger.warn('Uploaded file not found or empty', { stepKey: step.key, fileId });
                    return [];
                }
                const recs = parseCsv(content, delimiter, hasHeader) as any[];
                const result = applyOffset(recs, offset);
                this.logger.debug('Extracted records from uploaded file', { stepKey: step.key, fileId, count: result.length });
                return result as any;
            } catch (err) {
                this.logger.warn('Failed to read uploaded file', {
                    stepKey: step.key,
                    fileId,
                    error: err instanceof Error ? err.message : String(err),
                });
                return [];
            }
        }

        // Priority 2: rows - inline JSON array
        if (Array.isArray(rows)) {
            if (rows.length === 0) return [];
            if (hasHeader && Array.isArray(rows[0])) {
                const header = rows[0] as string[];
                const recs = rows.slice(1).map(r => arrayToObject(header, r as any[]));
                return applyOffset(recs, offset);
            }
            return applyOffset(rows, offset);
        }

        // Priority 3: csvText - inline CSV string
        if (typeof text === 'string') {
            const recs = parseCsv(text, delimiter, hasHeader) as any[];
            return applyOffset(recs, offset) as any;
        }

        // Priority 4: csvPath - local filesystem (dev/testing)
        if (csvPath && fs.existsSync(csvPath)) {
            try {
                const content = fs.readFileSync(csvPath, 'utf8');
                const recs = parseCsv(content, delimiter, hasHeader) as any[];
                return applyOffset(recs, offset) as any;
            } catch (err) {
                this.logger.warn('Failed to parse CSV file', {
                    stepKey: step.key,
                    path: csvPath,
                    error: err instanceof Error ? err.message : String(err),
                });
                return [];
            }
        }

        return [];
    }

    private async extractJson(
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
    ): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;
        const fileId = (cfg as any)?.fileId as string | undefined;
        const jsonText = (cfg as any)?.jsonText as string | undefined;
        const jsonPath = (cfg as any)?.jsonPath as string | undefined;
        const itemsPath = (cfg as any)?.itemsPath as string | undefined;
        const offset = executorCtx.cpData?.[step.key]?.offset ?? 0;

        let data: any = null;

        // Priority 1: fileId - read from uploaded file storage
        if (fileId) {
            try {
                const content = await this.fileStorageService.readFileAsString(fileId);
                if (!content) {
                    this.logger.warn('Uploaded JSON file not found or empty', { stepKey: step.key, fileId });
                    return [];
                }
                data = JSON.parse(content);
                this.logger.debug('Parsed JSON from uploaded file', { stepKey: step.key, fileId });
            } catch (err) {
                this.logger.warn('Failed to read/parse uploaded JSON file', {
                    stepKey: step.key,
                    fileId,
                    error: err instanceof Error ? err.message : String(err),
                });
                return [];
            }
        }

        // Priority 2: jsonText - inline JSON string
        if (!data && typeof jsonText === 'string') {
            try {
                data = JSON.parse(jsonText);
            } catch (err) {
                this.logger.warn('Failed to parse inline JSON', {
                    stepKey: step.key,
                    error: err instanceof Error ? err.message : String(err),
                });
                return [];
            }
        }

        // Priority 3: jsonPath - local filesystem (dev/testing)
        if (!data && jsonPath && fs.existsSync(jsonPath)) {
            try {
                const content = fs.readFileSync(jsonPath, 'utf8');
                data = JSON.parse(content);
                this.logger.debug('Parsed JSON from file path', { stepKey: step.key, jsonPath });
            } catch (err) {
                this.logger.warn('Failed to read/parse JSON file', {
                    stepKey: step.key,
                    path: jsonPath,
                    error: err instanceof Error ? err.message : String(err),
                });
                return [];
            }
        }

        if (data === null) {
            this.logger.warn('JSON extractor: no data source provided', { stepKey: step.key });
            return [];
        }

        // Extract items from nested path if specified
        let items: any[] = [];
        if (itemsPath) {
            const extracted = getPath(data, itemsPath);
            if (Array.isArray(extracted)) {
                items = extracted;
            } else if (extracted !== null && extracted !== undefined) {
                items = [extracted];
            }
        } else if (Array.isArray(data)) {
            items = data;
        } else if (typeof data === 'object' && data !== null) {
            items = [data];
        }

        // Apply offset for checkpoint resume (checkpoint is cleared at pipeline start for fresh runs)
        const result = items.slice(Math.max(0, offset));
        if (executorCtx.cpData) {
            executorCtx.cpData[step.key] = { ...(executorCtx.cpData[step.key] ?? {}), offset: offset + result.length };
            executorCtx.markCheckpointDirty();
        }

        this.logger.debug('Extracted JSON records', { stepKey: step.key, count: result.length });
        return result as RecordObject[];
    }

    /**
     * Extract records from in-memory data (webhook payloads, inline data, etc.)
     */
    private async extractInMemory(step: PipelineStepDefinition): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;
        const data = (cfg as any)?.data;

        if (data === undefined || data === null) {
            this.logger.warn('inMemory extractor: no data provided', { stepKey: step.key });
            return [];
        }

        // Handle array of objects
        if (Array.isArray(data)) {
            return data as RecordObject[];
        }

        // Handle single object - wrap in array
        if (typeof data === 'object') {
            return [data as RecordObject];
        }

        this.logger.warn('inMemory extractor: data must be an array or object', { stepKey: step.key });
        return [];
    }

    private async extractGenerator(step: PipelineStepDefinition): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;
        const count = Number((cfg as any)?.count) || 10;
        const template = (cfg as any)?.template as Record<string, any> | undefined;

        const records: RecordObject[] = [];
        for (let i = 0; i < count; i++) {
            const record: Record<string, any> = { _index: i };

            if (template && typeof template === 'object') {
                for (const [key, generator] of Object.entries(template)) {
                    record[key] = this.generateValue(generator, i);
                }
            } else {
                // Default template: id, name, value
                record.id = i + 1;
                record.name = `Item ${i + 1}`;
                record.value = Math.floor(Math.random() * 1000);
                record.createdAt = new Date().toISOString();
            }

            records.push(record as RecordObject);
        }

        this.logger.debug('Generated test records', { stepKey: step.key, count: records.length });
        return records;
    }

    private generateValue(generator: any, index: number): any {
        if (typeof generator === 'string') {
            // Handle generator strings like "uuid", "timestamp", "index", "random:100"
            if (generator === 'uuid') {
                return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            }
            if (generator === 'timestamp') {
                return Date.now();
            }
            if (generator === 'isoDate') {
                return new Date().toISOString();
            }
            if (generator === 'index') {
                return index;
            }
            if (generator.startsWith('random:')) {
                const max = parseInt(generator.split(':')[1], 10) || 100;
                return Math.floor(Math.random() * max);
            }
            if (generator.startsWith('seq:')) {
                const start = parseInt(generator.split(':')[1], 10) || 1;
                return start + index;
            }
            // Return as literal value
            return generator;
        }
        return generator;
    }

    private async extractRest(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        onRecordError?: OnRecordErrorCallback,
    ): Promise<RecordObject[]> {
        const cfg: any = step.config ?? {};
        const method = (cfg.method ?? 'GET').toUpperCase();
        const connectionCode = typeof cfg.connectionCode === 'string' ? cfg.connectionCode : undefined;
        const connectionEntity = connectionCode ? await this.connectionService.getByCode(ctx, connectionCode) : null;
        const connectionConfig =
            connectionEntity?.type === 'http'
                ? this.normalizeHttpConnectionConfig(connectionEntity.config as JsonObject)
                : null;

        let endpoint = String(cfg.endpoint ?? '');
        if (connectionConfig?.baseUrl) {
            endpoint = this.combineEndpoint(connectionConfig.baseUrl, endpoint);
        }

        const baseHeaders = this.mergeHeaders(connectionConfig?.headers, cfg.headers as Record<string, unknown> | undefined);

        const pageParam = cfg.pageParam as string | undefined;
        const itemsField = cfg.itemsField as string | undefined;
        const nextPageField = cfg.nextPageField as string | undefined;
        const maxPages = Number(cfg.maxPages ?? DEFAULTS.MAX_PAGES);
        const query = cfg.query ?? {};
        const body = cfg.body ?? undefined;
        const results: any[] = [];
        let page = 1;

        // Resume from checkpoint (checkpoint is cleared at pipeline start for fresh runs)
        if (executorCtx.cpData) {
            const cp = executorCtx.cpData[step.key];
            if (cp && typeof cp.page === 'number') {
                page = Math.max(1, Number(cp.page) + 1);
            }
        }

        let url = endpoint;
        const fetchImpl: any = (global as any).fetch;
        if (!fetchImpl) {
            return [];
        }

        const makeUrl = (p: number) => {
            const qp = new URLSearchParams();
            for (const [k, v] of Object.entries(query as any)) {
                qp.set(k, String(v));
            }
            if (pageParam) qp.set(pageParam, String(p));
            const qs = qp.toString();
            const sep = endpoint.includes('?') ? '&' : '?';
            const final = qs ? `${endpoint}${sep}${qs}` : endpoint;
            return final;
        };

        let lastPageFetched = page - 1;
        // Use step config first, fall back to pipeline context errorHandling
        const errorCfg = executorCtx.errorHandling;
        const retries = Math.max(0, Number(cfg.retries ?? errorCfg?.maxRetries ?? 0));
        const retryDelay = Math.max(0, Number(cfg.retryDelayMs ?? errorCfg?.retryDelayMs ?? 0));
        const maxRetryDelay = Number(cfg.maxRetryDelayMs ?? errorCfg?.maxRetryDelayMs ?? HTTP.RETRY_MAX_DELAY_MS);
        const backoffMultiplier = Number(cfg.backoffMultiplier ?? errorCfg?.backoffMultiplier ?? HTTP.BACKOFF_MULTIPLIER);
        let adaptiveDelay = 0;
        const timeoutMs = Number(cfg.timeoutMs ?? connectionConfig?.timeout ?? 0);

        for (let i = 0; i < (pageParam ? maxPages : 1); i++) {
            url = makeUrl(page);
            try {
                const headers: Record<string, string> = { ...(baseHeaders ?? {}) };
                const stepAuthApplied = await this.applyStepAuth({ ctx, cfg, headers, method, url, body });
                if (!stepAuthApplied && connectionConfig?.auth) {
                    await this.applyConnectionAuth(ctx, connectionConfig.auth, headers);
                }

                const options: any = { method, headers };
                if (method === 'POST' && body) {
                    options.body = JSON.stringify(body);
                    options.headers = { 'Content-Type': 'application/json', ...(headers ?? {}) };
                }

                let attempt = 0;
                let res: any = null;
                while (attempt <= retries) {
                    try {
                        if (timeoutMs > 0) {
                            const controller = new AbortController();
                            const t = setTimeout(() => controller.abort(), timeoutMs);
                            res = await fetchImpl(url, { ...options, signal: controller.signal });
                            clearTimeout(t);
                        } else {
                            res = await fetchImpl(url, options);
                        }
                        if (res && res.ok) {
                            adaptiveDelay = Math.max(0, Math.floor(adaptiveDelay * 0.5));
                            break;
                        }
                        if (res && (res.status === 429 || res.status === 503)) {
                            adaptiveDelay = Math.max(DEFAULTS.ADAPTIVE_DELAY_MIN_MS, adaptiveDelay ? adaptiveDelay * 2 : DEFAULTS.ADAPTIVE_DELAY_INITIAL_MS);
                        }
                        if (attempt < retries) {
                            // Calculate exponential backoff delay
                            const expDelay = Math.min(retryDelay * Math.pow(backoffMultiplier, attempt), maxRetryDelay);
                            await sleep(Math.max(expDelay, adaptiveDelay));
                        }
                    } catch {
                        if (attempt < retries) {
                            const expDelay = Math.min(retryDelay * Math.pow(backoffMultiplier, attempt), maxRetryDelay);
                            await sleep(Math.max(expDelay, adaptiveDelay || DEFAULTS.ADAPTIVE_DELAY_INITIAL_MS));
                        } else {
                            throw new Error('fetch failed');
                        }
                    }
                    attempt++;
                }

                if (!res || !res.ok) {
                    if (onRecordError) {
                        await onRecordError(step.key, `REST ${method} ${url} failed: ${res?.status ?? 'ERR'}`, { url, page } as any);
                    }
                    break;
                }

                const data = await res.json();
                let items: any[] = Array.isArray(data) ? data : (itemsField ? (getPath(data, itemsField) ?? []) : []);
                if (!Array.isArray(items)) items = [];

                // Optional mapping of fields
                const mapFields = cfg.mapFields as Record<string, string> | undefined;
                if (mapFields && Object.keys(mapFields).length > 0) {
                    items = items.map(it => this.applyMapping(it as any, mapFields as any));
                }

                for (const it of items) results.push(it);
                const nextVal = nextPageField ? getPath(data, nextPageField) : undefined;
                if (pageParam && nextPageField && nextVal) {
                    lastPageFetched = page++;
                    continue;
                }
                if (pageParam && !nextPageField && items.length > 0) {
                    lastPageFetched = page++;
                    continue;
                }
                break;
            } catch (err) {
                this.logger.warn('REST extraction failed', {
                    stepKey: step.key,
                    url,
                    page,
                    error: err instanceof Error ? err.message : String(err),
                });
                break;
            }
        }

        if (executorCtx.cpData && pageParam) {
            executorCtx.cpData[step.key] = { ...(executorCtx.cpData[step.key] ?? {}), page: lastPageFetched };
            executorCtx.markCheckpointDirty();
        }

        return results as any;
    }

    private async extractGraphql(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        onRecordError?: OnRecordErrorCallback,
    ): Promise<RecordObject[]> {
        const cfg: any = step.config ?? {};
        const endpoint = String(cfg.endpoint ?? '');
        const itemsField = cfg.itemsField ? String(cfg.itemsField) : '';
        const edgesField = cfg.edgesField ? String(cfg.edgesField) : '';
        const nodeField = cfg.nodeField ? String(cfg.nodeField) : 'node';
        const cursorVar = String(cfg.cursorVar ?? 'cursor');
        const nextCursorField = cfg.nextCursorField ? String(cfg.nextCursorField) : '';
        const pageInfoField = cfg.pageInfoField ? String(cfg.pageInfoField) : '';
        const hasNextPageField = cfg.hasNextPageField ? String(cfg.hasNextPageField) : '';
        const endCursorField = cfg.endCursorField ? String(cfg.endCursorField) : '';
        let headers = cfg.headers ?? {};

        // Auth presets from secrets
        try {
            const auth = (cfg.auth as ConnectionAuthType | undefined) ?? ConnectionAuthType.NONE;
            if (auth === ConnectionAuthType.BEARER && cfg.bearerTokenSecretCode) {
                const token = await this.resolveSecret(ctx, String(cfg.bearerTokenSecretCode));
                if (token) headers = { ...(headers ?? {}), Authorization: `Bearer ${token}` };
            } else if (auth === ConnectionAuthType.BASIC && cfg.basicSecretCode) {
                const secret = await this.resolveSecret(ctx, String(cfg.basicSecretCode));
                if (secret && secret.includes(':')) {
                    const token = Buffer.from(secret).toString('base64');
                    headers = { ...(headers ?? {}), Authorization: `Basic ${token}` };
                }
            }
        } catch (error) {
            this.logger.warn('Failed to resolve authentication secrets for GraphQL extractor', {
                stepKey: step.key,
                error: (error as Error)?.message,
            });
        }

        const fetchImpl: any = (global as any).fetch;
        if (!fetchImpl) return [];

        // Resume from checkpoint (checkpoint is cleared at pipeline start for fresh runs)
        let cursor: any = executorCtx.cpData?.[step.key]?.cursor ?? null;
        const results: any[] = [];

        for (let i = 0; i < DEFAULTS.MAX_GRAPHQL_PAGES; i++) {
            const variables = { ...(cfg.variables ?? {}), ...(cursor ? { [cursorVar]: cursor } : {}) };
            const res = await fetchImpl(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
                body: JSON.stringify({ query: String(cfg.query ?? ''), variables }),
            });

            if (!res.ok) {
                if (onRecordError) {
                    await onRecordError(step.key, `GraphQL query failed: ${res.status}`, { endpoint } as any);
                }
                break;
            }

            const data = await res.json();
            const gqlErrors: Array<{ message?: string }> = Array.isArray((data as any)?.errors) ? (data as any).errors : [];
            if (gqlErrors.length) {
                const msg = gqlErrors.map(e => e?.message ?? 'GraphQL error').join('; ');
                if (onRecordError) {
                    await onRecordError(step.key, msg, { endpoint, variables } as any);
                }
                break;
            }

            let items: any[] = [];
            if (Array.isArray(data)) {
                items = data;
            } else if (edgesField) {
                const edges = getPath(data, edgesField) ?? [];
                if (Array.isArray(edges)) {
                    for (const e of edges) {
                        if (e && typeof e === 'object' && e[nodeField] != null) {
                            items.push(e[nodeField]);
                        }
                    }
                }
            } else if (itemsField) {
                items = (getPath(data, itemsField) ?? []);
            }
            if (!Array.isArray(items)) items = [];

            for (const it of items) results.push(it);

            // Determine next cursor
            let next: any = undefined;
            if (nextCursorField) {
                next = getPath(data, nextCursorField);
            } else if (endCursorField) {
                next = getPath(data, endCursorField);
                // Optionally honor hasNextPage
                if (hasNextPageField) {
                    const has = Boolean(getPath(data, hasNextPageField));
                    if (!has) next = undefined;
                } else if (pageInfoField) {
                    // If pageInfo provided, try pageInfo.hasNextPage
                    const pi = getPath(data, pageInfoField);
                    if (pi && typeof pi === 'object' && (pi as any).hasNextPage === false) next = undefined;
                }
            }

            if (!next || next === cursor) break;
            cursor = next;
            if (executorCtx.cpData) {
                executorCtx.cpData[step.key] = { ...(executorCtx.cpData[step.key] ?? {}), cursor };
                executorCtx.markCheckpointDirty();
            }
        }

        return results as any;
    }

    private async extractVendureQuery(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        onRecordError?: OnRecordErrorCallback,
    ): Promise<RecordObject[]> {
        const cfg: any = step.config ?? {};
        const entityType = cfg.entity as string;

        this.logger.info('vendure-query: starting extraction', {
            stepKey: step.key,
            entity: entityType,
            config: JSON.stringify(cfg),
        });

        if (!entityType) {
            this.logger.warn('vendure-query: missing entity type', { stepKey: step.key, config: JSON.stringify(cfg) });
            return [];
        }

        const entityClass = getEntityClass(entityType as any);
        if (!entityClass) {
            this.logger.warn('vendure-query: unknown entity type', { stepKey: step.key, entity: entityType });
            if (onRecordError) {
                await onRecordError(step.key, `Unknown entity type: ${entityType}`, { entity: entityType });
            }
            return [];
        }

        this.logger.debug('vendure-query: entity class found', { stepKey: step.key, entityClass: entityClass.name });

        const batchSize = Number(cfg.batchSize) || DEFAULTS.BATCH_SIZE;
        // Parse relations - handle both string (comma-separated) and array formats
        let relations: string[] = [];
        if (typeof cfg.relations === 'string' && cfg.relations.trim()) {
            relations = cfg.relations.split(',').map((r: string) => r.trim()).filter(Boolean);
        } else if (Array.isArray(cfg.relations)) {
            relations = cfg.relations;
        }

        const sortBy = cfg.sortBy || 'createdAt';
        const sortOrder = cfg.sortOrder || 'ASC';

        // Validate relations - block 3+ level deep relations (e.g., "a.b.c")
        // Allow 2-level relations like "variants.translations" which TypeORM handles fine
        const tooDeepRelations = relations.filter(r => (r.match(/\./g) || []).length > 1);
        if (tooDeepRelations.length > 0) {
            const errorMsg = `Relations with 3+ levels are not supported: ${tooDeepRelations.join(', ')}. ` +
                `Use relations like 'variants.translations' (2 levels max).`;
            this.logger.warn('vendure-query: too deep relations detected', {
                stepKey: step.key,
                entity: entityType,
                tooDeepRelations,
            });
            if (onRecordError) {
                await onRecordError(step.key, errorMsg, { entity: entityType, tooDeepRelations });
            }
            return [];
        }

        const results: RecordObject[] = [];

        try {
            this.logger.debug('vendure-query: getting repository', { stepKey: step.key, entity: entityType });
            const repo = this.connection.getRepository(ctx, entityClass);

            // First, check total count
            const totalCount = await repo.count();
            this.logger.info('vendure-query: total entities in table', { stepKey: step.key, entity: entityType, totalCount });

            // Resume from checkpoint (checkpoint is cleared at pipeline start for fresh runs)
            const offset = executorCtx.cpData?.[step.key]?.offset ?? 0;
            this.logger.info('vendure-query: using offset', { stepKey: step.key, offset, batchSize, totalCount });

            const queryBuilder = repo.createQueryBuilder('entity');

            // Add relations - handle both single-level and two-level (e.g., "variants.translations")
            const addedAliases = new Set<string>();
            for (const relation of relations) {
                if (relation.includes('.')) {
                    // Two-level relation like "variants.translations"
                    const [parent, child] = relation.split('.');
                    const parentAlias = parent;
                    const childAlias = `${parent}_${child}`;

                    // First add parent if not already added
                    if (!addedAliases.has(parentAlias)) {
                        queryBuilder.leftJoinAndSelect(`entity.${parent}`, parentAlias);
                        addedAliases.add(parentAlias);
                    }
                    // Then add child relation
                    queryBuilder.leftJoinAndSelect(`${parentAlias}.${child}`, childAlias);
                    addedAliases.add(childAlias);
                } else {
                    // Single-level relation
                    if (!addedAliases.has(relation)) {
                        queryBuilder.leftJoinAndSelect(`entity.${relation}`, relation);
                        addedAliases.add(relation);
                    }
                }
            }
            this.logger.debug('vendure-query: added relations', { stepKey: step.key, relations, aliases: Array.from(addedAliases) });

            // Add filters
            if (Array.isArray(cfg.filters)) {
                for (const filter of cfg.filters) {
                    if (!filter?.field || !filter?.operator) continue;
                    const paramName = `filter_${filter.field.replace(/\./g, '_')}`;
                    switch (filter.operator) {
                        case 'eq':
                            queryBuilder.andWhere(`entity.${filter.field} = :${paramName}`, { [paramName]: filter.value });
                            break;
                        case 'ne':
                            queryBuilder.andWhere(`entity.${filter.field} != :${paramName}`, { [paramName]: filter.value });
                            break;
                        case 'gt':
                            queryBuilder.andWhere(`entity.${filter.field} > :${paramName}`, { [paramName]: filter.value });
                            break;
                        case 'gte':
                            queryBuilder.andWhere(`entity.${filter.field} >= :${paramName}`, { [paramName]: filter.value });
                            break;
                        case 'lt':
                            queryBuilder.andWhere(`entity.${filter.field} < :${paramName}`, { [paramName]: filter.value });
                            break;
                        case 'lte':
                            queryBuilder.andWhere(`entity.${filter.field} <= :${paramName}`, { [paramName]: filter.value });
                            break;
                        case 'in':
                            queryBuilder.andWhere(`entity.${filter.field} IN (:...${paramName})`, { [paramName]: filter.value });
                            break;
                        case 'like':
                        case 'contains':
                            queryBuilder.andWhere(`entity.${filter.field} LIKE :${paramName}`, { [paramName]: `%${filter.value}%` });
                            break;
                    }
                }
            }

            // Add custom where clause
            if (cfg.where && typeof cfg.where === 'object') {
                for (const [field, value] of Object.entries(cfg.where)) {
                    const paramName = `where_${field.replace(/\./g, '_')}`;
                    queryBuilder.andWhere(`entity.${field} = :${paramName}`, { [paramName]: value });
                }
            }

            // Add sorting and pagination
            queryBuilder.orderBy(`entity.${sortBy}`, sortOrder);
            queryBuilder.skip(offset).take(batchSize);

            // Execute query
            const entities = await queryBuilder.getMany();

            this.logger.debug('vendure-query: fetched entities', {
                stepKey: step.key,
                entity: entityType,
                count: entities.length,
                offset,
                batchSize,
            });

            // Convert entities to records
            for (const entity of entities) {
                const record = entityToRecord(entity as unknown as EntityLike, cfg);
                results.push(record as RecordObject);
            }

            // Update checkpoint
            if (executorCtx.cpData) {
                executorCtx.cpData[step.key] = { ...(executorCtx.cpData[step.key] ?? {}), offset: offset + entities.length };
                executorCtx.markCheckpointDirty();
            }

            return results;
        } catch (error) {
            const errorMsg = (error as Error).message || String(error);
            let userFriendlyMsg = `Vendure query failed: ${errorMsg}`;

            // Provide more helpful messages for common errors
            if (errorMsg.includes('Relation with property path') && errorMsg.includes('was not found')) {
                // Extract the relation path from the error message
                const match = errorMsg.match(/Relation with property path ([^\s]+)/);
                const relationPath = match ? match[1] : 'unknown';
                userFriendlyMsg = `Invalid relation "${relationPath}" for entity "${entityType}". ` +
                    `This is likely a deep nested relation. Use only single-level relations (e.g., 'customer', 'lines') ` +
                    `and access nested data via the loaded relation properties.`;
            } else if (errorMsg.includes('is not a function')) {
                userFriendlyMsg = `Query builder error for entity "${entityType}". Check that the entity exists and relations are valid.`;
            }

            this.logger.error('vendure-query: extraction failed', error as Error, { stepKey: step.key, entity: entityType });
            if (onRecordError) {
                await onRecordError(step.key, userFriendlyMsg, { entity: entityType });
            }
            return [];
        }
    }

    private mergeHeaders(
        ...sources: Array<Record<string, unknown> | undefined>
    ): Record<string, string> {
        const merged: Record<string, string> = {};
        for (const source of sources) {
            if (!source || typeof source !== 'object') continue;
            for (const [key, value] of Object.entries(source)) {
                if (typeof value === 'string') {
                    merged[key] = value;
                }
            }
        }
        return merged;
    }

    private normalizeHttpConnectionConfig(config?: JsonObject | null): NormalizedHttpConnectionConfig | null {
        if (!config || typeof config !== 'object') {
            return null;
        }
        const normalized: NormalizedHttpConnectionConfig = {};
        if (typeof (config as any).baseUrl === 'string') {
            normalized.baseUrl = (config as any).baseUrl;
        }
        if (typeof (config as any).timeout === 'number') {
            normalized.timeout = Number((config as any).timeout);
        }
        if ((config as any).headers && typeof (config as any).headers === 'object') {
            normalized.headers = this.mergeHeaders((config as any).headers as Record<string, unknown>);
        }
        if ((config as any).auth && typeof (config as any).auth === 'object') {
            const rawAuth = (config as any).auth as Record<string, unknown>;
            const auth: StoredHttpAuthConfig = {
                type: (rawAuth.type as ConnectionAuthType) ?? ConnectionAuthType.NONE,
            };
            if (typeof rawAuth.headerName === 'string') auth.headerName = rawAuth.headerName;
            if (typeof rawAuth.secretCode === 'string') auth.secretCode = rawAuth.secretCode;
            if (typeof rawAuth.username === 'string') auth.username = rawAuth.username;
            if (typeof rawAuth.usernameSecretCode === 'string') auth.usernameSecretCode = rawAuth.usernameSecretCode;
            normalized.auth = auth;
        }
        return normalized;
    }

    private combineEndpoint(baseUrl: string, endpoint: string): string {
        if (!baseUrl) {
            return endpoint;
        }
        if (/^https?:\/\//i.test(endpoint)) {
            return endpoint;
        }
        const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        return `${normalizedBase}${normalizedEndpoint}`;
    }

    private async resolveSecret(ctx: RequestContext, code?: string | null): Promise<string | null> {
        if (!code) {
            return null;
        }
        try {
            return await this.secretService.resolve(ctx, code);
        } catch (err) {
            this.logger.debug('Failed to resolve secret', {
                secretCode: code,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    }

    private async applyStepAuth(params: {
        ctx: RequestContext;
        cfg: any;
        headers: Record<string, string>;
        method: string;
        url: string;
        body?: unknown;
    }): Promise<boolean> {
        const { ctx, cfg, headers, method, url, body } = params;
        if (cfg.bearerToken || cfg.bearerTokenSecretCode) {
            let token: string | undefined = cfg.bearerToken ? String(cfg.bearerToken) : undefined;
            if (!token && cfg.bearerTokenSecretCode) {
                token = await this.resolveSecret(ctx, String(cfg.bearerTokenSecretCode)) ?? undefined;
            }
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
                return true;
            }
        }
        if ((cfg.basicUser && cfg.basicPass) || cfg.basicSecretCode) {
            let user = cfg.basicUser ? String(cfg.basicUser) : '';
            let pass = cfg.basicPass ? String(cfg.basicPass) : '';
            if (cfg.basicSecretCode) {
                const secret = await this.resolveSecret(ctx, String(cfg.basicSecretCode));
                if (secret && secret.includes(':')) {
                    const [u, p] = secret.split(':');
                    user = u;
                    pass = p;
                }
            }
            if (user && pass) {
                headers['Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
                return true;
            }
        }
        if (cfg.hmacHeader && (cfg.hmacSecret || cfg.hmacSecretCode)) {
            const secret = cfg.hmacSecret ? String(cfg.hmacSecret) : await this.resolveSecret(ctx, String(cfg.hmacSecretCode));
            if (!secret) {
                return false;
            }
            const now = Math.floor(Date.now() / 1000);
            const path = new URL(url, 'http://localhost');
            const template = (cfg.hmacPayloadTemplate as string | undefined) ?? '${method}:${path}:${timestamp}';
            const payload = template
                .replace('${method}', method)
                .replace('${path}', path.pathname + path.search)
                .replace('${timestamp}', String(now))
                .replace('${body}', body ? JSON.stringify(body) : '');
            const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
            headers[String(cfg.hmacHeader)] = signature;
            return true;
        }
        return false;
    }

    private async applyConnectionAuth(
        ctx: RequestContext,
        auth: StoredHttpAuthConfig,
        headers: Record<string, string>,
    ): Promise<void> {
        switch (auth.type) {
            case ConnectionAuthType.BEARER: {
                const token = await this.resolveSecret(ctx, auth.secretCode);
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
                break;
            }
            case ConnectionAuthType.API_KEY: {
                const apiKey = await this.resolveSecret(ctx, auth.secretCode);
                if (apiKey) {
                    const headerName = auth.headerName || 'X-API-Key';
                    headers[headerName] = apiKey;
                }
                break;
            }
            case ConnectionAuthType.BASIC: {
                const username = auth.usernameSecretCode
                    ? await this.resolveSecret(ctx, auth.usernameSecretCode)
                    : auth.username;
                const password = await this.resolveSecret(ctx, auth.secretCode);
                if (username && password) {
                    headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
                }
                break;
            }
        }
    }

    private applyMapping(record: RecordObject, mapping: Record<string, string>): RecordObject {
        const out: Record<string, any> = {};
        for (const [dst, srcPath] of Object.entries(mapping)) {
            out[dst] = getPath(record, srcPath);
        }
        return out as RecordObject;
    }
}
