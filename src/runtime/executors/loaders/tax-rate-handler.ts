/**
 * Tax Rate upsert loader handler
 *
 * Reads configurable field names from step.config, resolves tax category and zone
 * by code, and upserts TaxRate entities via TaxRateService.
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    TaxRateService,
    TaxCategoryService,
    ZoneService,
    ID,
} from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig, JsonObject } from '../../../types/index';
import { assertCreateDuplicateCanBeSkipped, CreateDuplicateHandlingConfig } from './duplicate-handling';
import { RecordObject, OnRecordErrorCallback, LoaderExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { LoadStrategy } from '../../../constants/enums';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import {
    getBooleanValue,
    getNumberValue,
    getStringValue,
} from '../../../loaders/shared-helpers';
import { resolveEntityReferenceId } from '../../../loaders/entity-reference.helpers';

/**
 * Configuration for the tax rate handler step (mirrors loader-handler-registry.ts schema)
 */
interface TaxRateHandlerConfig extends CreateDuplicateHandlingConfig {
    nameField?: string;
    valueField?: string;
    enabledField?: string;
    taxCategoryCodeField?: string;
    taxCategoryIdField?: string;
    zoneCodeField?: string;
    zoneIdField?: string;
    strategy?: LoadStrategy;
}

/**
 * Safely extract config from step.config
 */
function getConfig(config: JsonObject): TaxRateHandlerConfig {
    return config as unknown as TaxRateHandlerConfig;
}

@Injectable()
export class TaxRateHandler implements LoaderHandler {
    constructor(
        private taxRateService: TaxRateService,
        private taxCategoryService: TaxCategoryService,
        private zoneService: ZoneService,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<LoaderExecutionResult> {
        const taxCategoryCache = new Map<string, ID>();
        const zoneCache = new Map<string, ID>();
        let ok = 0;
        let fail = 0;
        let skipped = 0;
        const cfg = getConfig(step.config);

        for (const rec of input) {
            try {
                const nameField = cfg.nameField ?? 'name';
                const valueField = cfg.valueField ?? 'value';
                const enabledField = cfg.enabledField ?? 'enabled';
                const taxCategoryCodeField = cfg.taxCategoryCodeField ?? 'taxCategoryCode';
                const taxCategoryIdField = cfg.taxCategoryIdField ?? 'taxCategoryId';
                const zoneCodeField = cfg.zoneCodeField ?? 'zoneCode';
                const zoneIdField = cfg.zoneIdField ?? 'zoneId';

                const name = getStringValue(rec, nameField);
                const value = getNumberValue(rec, valueField);

                if (!name) {
                    fail++;
                    if (onRecordError) {
                        await onRecordError(step.key, 'Missing required field: name', rec);
                    }
                    continue;
                }
                if (value === undefined || value === null) {
                    fail++;
                    if (onRecordError) {
                        await onRecordError(step.key, 'Missing required field: value', rec);
                    }
                    continue;
                }

                // Resolve enabled flag
                const enabled = getBooleanValue(rec, enabledField) ?? true;

                // Resolve tax category
                const taxCategoryId = await this.resolveTaxCategoryId(
                    ctx,
                    taxCategoryCache,
                    getStringValue(rec, taxCategoryCodeField),
                    getReferenceId(rec, taxCategoryIdField),
                );
                if (!taxCategoryId) {
                    fail++;
                    if (onRecordError) {
                        await onRecordError(step.key, `Tax category not found for record "${name}"`, rec);
                    }
                    continue;
                }

                // Resolve zone
                const zoneId = await this.resolveZoneId(
                    ctx,
                    zoneCache,
                    getStringValue(rec, zoneCodeField),
                    getReferenceId(rec, zoneIdField),
                );
                if (!zoneId) {
                    fail++;
                    if (onRecordError) {
                        await onRecordError(step.key, `Zone not found for record "${name}"`, rec);
                    }
                    continue;
                }

                // Find existing by name
                const existing = await this.findExistingByName(ctx, name);
                const strategy = cfg.strategy ?? LoadStrategy.UPSERT;

                if (existing) {
                    if (strategy === LoadStrategy.CREATE) {
                        assertCreateDuplicateCanBeSkipped(cfg, 'tax rate', name);
                        skipped++;
                        continue;
                    }
                    await this.taxRateService.update(ctx, {
                        id: existing.id,
                        name,
                        value,
                        enabled,
                        categoryId: taxCategoryId,
                        zoneId,
                    });
                } else {
                    if (strategy === LoadStrategy.UPDATE) {
                        fail++;
                        if (onRecordError) {
                            await onRecordError(step.key, `Tax rate not found for update: ${name}`, rec);
                        }
                        continue;
                    }
                    await this.taxRateService.create(ctx, {
                        name,
                        value,
                        enabled,
                        categoryId: taxCategoryId,
                        zoneId,
                    });
                }
                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'taxRateUpsert failed', rec, getErrorStack(e));
                }
                fail++;
            }
        }
        return { ok, fail, skipped };
    }

    private async findExistingByName(ctx: RequestContext, name: string): Promise<{ id: ID } | null> {
        const allRates = await this.taxRateService.findAll(ctx);
        const match = allRates.items.find(tr => tr.name === name);
        return match ? { id: match.id } : null;
    }

    private async resolveTaxCategoryId(
        ctx: RequestContext,
        cache: Map<string, ID>,
        code?: string,
        id?: ID,
    ): Promise<ID | null> {
        if (id !== undefined && code !== undefined) {
            throw new Error('Provide either taxCategoryId or taxCategoryCode, not both');
        }
        const cacheKey = id !== undefined ? `id:${String(id)}` : code ? `code:${code}` : undefined;
        if (cacheKey && cache.has(cacheKey)) {
            return cache.get(cacheKey) ?? null;
        }
        const resolved = await resolveEntityReferenceId(
            ctx,
            this.taxCategoryService,
            'Tax category',
            { id, code },
        );
        if (cacheKey && resolved !== null) cache.set(cacheKey, resolved);
        return resolved;
    }

    private async resolveZoneId(
        ctx: RequestContext,
        cache: Map<string, ID>,
        code?: string,
        id?: ID,
    ): Promise<ID | null> {
        if (id !== undefined && code !== undefined) {
            throw new Error('Provide either zoneId or zoneCode, not both');
        }
        const cacheKey = id !== undefined ? `id:${String(id)}` : code ? `code:${code}` : undefined;
        if (cacheKey && cache.has(cacheKey)) {
            return cache.get(cacheKey) ?? null;
        }
        const resolved = await resolveEntityReferenceId(
            ctx,
            this.zoneService,
            'Zone',
            { id, code },
        );
        if (cacheKey && resolved !== null) cache.set(cacheKey, resolved);
        return resolved;
    }
}

function getReferenceId(record: RecordObject, field: string): ID | undefined {
    const value = record[field];
    return typeof value === 'string' || typeof value === 'number'
        ? value
        : undefined;
}
