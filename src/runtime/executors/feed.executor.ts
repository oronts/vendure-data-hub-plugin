import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import * as fs from 'fs';
import { JsonValue, JsonObject, PipelineStepDefinition, PipelineContext } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { RecordObject, OnRecordErrorCallback, FeedExecutionResult } from '../executor-types';
import { getPath, recordsToCsv, recordsToXml, xmlEscape, ensureDirectoryExistsAsync } from '../utils';
import { FEED_NAMESPACES, EXAMPLE_URLS, getOutputPath, LOGGER_CONTEXTS } from '../../constants/index';
import { FileFormat } from '../../constants/enums';
import { BaseFeedConfig } from '../config-types';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { FeedAdapter, FeedContext, ConnectionConfig, ConnectionType } from '../../sdk/types';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';

@Injectable()
export class FeedExecutor {
    private readonly logger: DataHubLogger;

    constructor(
        private secretService: SecretService,
        private connectionService: ConnectionService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FEED_EXECUTOR);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        pipelineContext?: PipelineContext,
    ): Promise<FeedExecutionResult> {
        const cfg = step.config as BaseFeedConfig;
        const adapterCode = cfg.adapterCode;
        const startTime = Date.now();
        let ok = 0;
        let fail = 0;
        let outputPath: string | undefined;

        this.logger.debug(`Executing feed step`, {
            stepKey: step.key,
            adapterCode,
            recordCount: input.length,
        });

        // Common field mappings
        const titleField = cfg.titleField ?? 'name';
        const descriptionField = cfg.descriptionField ?? 'description';
        const priceField = cfg.priceField ?? 'price';
        const imageField = cfg.imageField ?? 'image';
        const linkField = cfg.linkField ?? 'link';
        const brandField = cfg.brandField ?? 'brand';
        const gtinField = cfg.gtinField ?? 'gtin';
        const availabilityField = cfg.availabilityField ?? 'availability';
        const currency = cfg.currency ?? 'USD';

        const getRecordId = (rec: RecordObject): string => {
            const id = getPath(rec, 'id') ?? getPath(rec, 'sku') ?? '';
            return String(id);
        };

        const mapToFeedItem = (rec: RecordObject): Record<string, string> => {
            return {
                id: getRecordId(rec),
                title: String(getPath(rec, titleField) ?? ''),
                description: String(getPath(rec, descriptionField) ?? ''),
                link: String(getPath(rec, linkField) ?? ''),
                image_link: String(getPath(rec, imageField) ?? ''),
                price: `${getPath(rec, priceField) ?? 0} ${currency}`,
                brand: String(getPath(rec, brandField) ?? ''),
                gtin: String(getPath(rec, gtinField) ?? ''),
                availability: String(getPath(rec, availabilityField) ?? 'in stock'),
                condition: 'new',
            };
        };

        switch (adapterCode) {
            case 'googleMerchant': {
                try {
                    const filePath = cfg.outputPath ?? getOutputPath('google-merchant', 'xml');
                    outputPath = filePath;
                    const items = input.map(mapToFeedItem);
                    const shopUrl = (cfg as Record<string, JsonValue>).storeUrl ?? EXAMPLE_URLS.BASE;
                    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
                    xml += `<rss version="2.0" xmlns:g="${FEED_NAMESPACES.GOOGLE_PRODUCT}">\n`;
                    xml += '  <channel>\n';
                    xml += `    <title>Product Feed</title>\n`;
                    xml += `    <link>${shopUrl}</link>\n`;
                    xml += `    <description>Google Merchant Center Product Feed</description>\n`;
                    for (const item of items) {
                        xml += '    <item>\n';
                        xml += `      <g:id>${xmlEscape(item.id)}</g:id>\n`;
                        xml += `      <g:title>${xmlEscape(item.title)}</g:title>\n`;
                        xml += `      <g:description>${xmlEscape(item.description)}</g:description>\n`;
                        xml += `      <g:link>${xmlEscape(item.link)}</g:link>\n`;
                        xml += `      <g:image_link>${xmlEscape(item.image_link)}</g:image_link>\n`;
                        xml += `      <g:price>${xmlEscape(item.price)}</g:price>\n`;
                        xml += `      <g:brand>${xmlEscape(item.brand)}</g:brand>\n`;
                        xml += `      <g:gtin>${xmlEscape(item.gtin)}</g:gtin>\n`;
                        xml += `      <g:availability>${xmlEscape(item.availability)}</g:availability>\n`;
                        xml += `      <g:condition>${item.condition}</g:condition>\n`;
                        xml += '    </item>\n';
                    }
                    xml += '  </channel>\n';
                    xml += '</rss>';
                    await ensureDirectoryExistsAsync(filePath);
                    await fs.promises.writeFile(filePath, xml, 'utf-8');
                    ok = items.length;
                } catch (e: unknown) {
                    fail = input.length;
                    const message = e instanceof Error ? e.message : 'Google Merchant feed failed';
                    if (onRecordError) await onRecordError(step.key, message, {});
                }
                break;
            }
            case 'metaCatalog': {
                try {
                    const filePath = cfg.outputPath ?? getOutputPath('meta-catalog', 'csv');
                    outputPath = filePath;
                    const items = input.map(rec => ({
                        id: getRecordId(rec),
                        title: String(getPath(rec, titleField) ?? ''),
                        description: String(getPath(rec, descriptionField) ?? ''),
                        availability: String(getPath(rec, availabilityField) ?? 'in stock'),
                        condition: 'new',
                        price: `${getPath(rec, priceField) ?? 0} ${currency}`,
                        link: String(getPath(rec, linkField) ?? ''),
                        image_link: String(getPath(rec, imageField) ?? ''),
                        brand: String(getPath(rec, brandField) ?? ''),
                    }));
                    const csv = recordsToCsv(items, ',', true);
                    await ensureDirectoryExistsAsync(filePath);
                    await fs.promises.writeFile(filePath, csv, 'utf-8');
                    ok = items.length;
                } catch (e: unknown) {
                    fail = input.length;
                    const message = e instanceof Error ? e.message : 'Meta Catalog feed failed';
                    if (onRecordError) await onRecordError(step.key, message, {});
                }
                break;
            }
            case 'amazonFeed': {
                try {
                    const filePath = cfg.outputPath ?? getOutputPath('amazon', 'txt');
                    outputPath = filePath;
                    const items = input.map(rec => {
                        const sku = getPath(rec, 'sku') ?? getPath(rec, 'id') ?? '';
                        const stockOnHand = getPath(rec, 'stockOnHand') ?? getPath(rec, 'quantity') ?? '0';
                        return {
                            sku: String(sku),
                            'product-id': String(getPath(rec, gtinField) ?? ''),
                            'product-id-type': 'UPC',
                            'item-name': String(getPath(rec, titleField) ?? ''),
                            'item-description': String(getPath(rec, descriptionField) ?? ''),
                            'standard-price': String(getPath(rec, priceField) ?? ''),
                            'quantity': String(stockOnHand),
                            'main-image-url': String(getPath(rec, imageField) ?? ''),
                            'brand-name': String(getPath(rec, brandField) ?? ''),
                        };
                    });
                    const tsv = recordsToCsv(items, '\t', true);
                    await ensureDirectoryExistsAsync(filePath);
                    await fs.promises.writeFile(filePath, tsv, 'utf-8');
                    ok = items.length;
                } catch (e: unknown) {
                    fail = input.length;
                    const message = e instanceof Error ? e.message : 'Amazon feed failed';
                    if (onRecordError) await onRecordError(step.key, message, {});
                }
                break;
            }
            case 'customFeed': {
                try {
                    const filePath = cfg.outputPath ?? getOutputPath('custom-feed', 'json');
                    outputPath = filePath;
                    const customConfig = cfg as Record<string, JsonValue>;
                    const format = (customConfig.format as string) ?? 'json';
                    const customFields = customConfig.fieldMapping as Record<string, string> | undefined;
                    const items = input.map(rec => {
                        if (customFields) {
                            const mapped: RecordObject = {};
                            for (const [targetKey, sourceKey] of Object.entries(customFields)) {
                                const val = getPath(rec, sourceKey);
                                if (val !== undefined) mapped[targetKey] = val as JsonValue;
                            }
                            return mapped;
                        }
                        return rec;
                    });
                    let content: string;
                    if (format === FileFormat.CSV) {
                        content = recordsToCsv(items as RecordObject[], ',', true);
                    } else if (format === FileFormat.TSV) {
                        content = recordsToCsv(items as RecordObject[], '\t', true);
                    } else if (format === FileFormat.XML) {
                        content = recordsToXml(items as RecordObject[], 'feed', 'item');
                    } else {
                        content = JSON.stringify(items, null, 2);
                    }
                    await ensureDirectoryExistsAsync(filePath);
                    await fs.promises.writeFile(filePath, content, 'utf-8');
                    ok = items.length;
                } catch (e: unknown) {
                    fail = input.length;
                    const message = e instanceof Error ? e.message : 'Custom feed failed';
                    if (onRecordError) await onRecordError(step.key, message, {});
                }
                break;
            }
            default: {
                // Try custom feed generators from registry
                if (adapterCode && this.registry) {
                    const customFeed = this.registry.getRuntime('FEED', adapterCode) as FeedAdapter<unknown> | undefined;
                    if (customFeed && typeof customFeed.generateFeed === 'function') {
                        const result = await this.executeCustomFeed(ctx, step, input, customFeed, pipelineContext);
                        ok = result.ok;
                        fail = result.fail;
                        outputPath = result.outputPath;
                        break;
                    }
                }
                this.logger.warn(`Unknown feed adapter`, { stepKey: step.key, adapterCode });
                ok = input.length;
                break;
            }
        }

        const durationMs = Date.now() - startTime;
        this.logger.info(`Feed generation complete`, {
            stepKey: step.key,
            adapterCode,
            ok,
            fail,
            outputPath,
            durationMs,
        });

        return { ok, fail, outputPath };
    }

    /**
     * Execute a custom feed adapter from the registry
     */
    private async executeCustomFeed(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        feed: FeedAdapter<unknown>,
        pipelineContext?: PipelineContext,
    ): Promise<FeedExecutionResult> {
        const cfg = step.config as BaseFeedConfig;

        // Create feed context for the custom feed generator
        const feedContext: FeedContext = {
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
            channelId: cfg?.channelId,
            languageCode: cfg?.languageCode,
            currencyCode: cfg?.currency ?? cfg?.currencyCode,
        };

        try {
            const result = await feed.generateFeed(feedContext, cfg, input as readonly JsonObject[]);
            return {
                ok: result.validCount ?? result.itemCount ?? input.length,
                fail: result.invalidCount ?? result.validationErrors?.length ?? 0,
                outputPath: result.outputPath,
            };
        } catch (error) {
            this.logger.error(`Custom feed generator failed`, error instanceof Error ? error : undefined, {
                adapterCode: feed.code,
                stepKey: step.key,
            });
            return { ok: 0, fail: input.length };
        }
    }
}
