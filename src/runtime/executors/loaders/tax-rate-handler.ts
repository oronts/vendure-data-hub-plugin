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
    TaxCategory,
    ID,
} from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig, JsonObject } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { getErrorMessage } from '../../../utils/error.utils';
import { getStringValue, getNumberValue } from '../../../loaders/shared-helpers';

/**
 * Configuration for the tax rate handler step (mirrors loader-handler-registry.ts schema)
 */
interface TaxRateHandlerConfig {
    nameField?: string;
    valueField?: string;
    enabledField?: string;
    taxCategoryCodeField?: string;
    taxCategoryIdField?: string;
    zoneCodeField?: string;
    zoneIdField?: string;
}

/**
 * Safely extract config from step.config
 */
function getConfig(config: JsonObject): TaxRateHandlerConfig {
    return config as unknown as TaxRateHandlerConfig;
}

@Injectable()
export class TaxRateHandler implements LoaderHandler {
    /** Cache for resolved IDs to reduce repeated lookups within a single batch */
    private taxCategoryCache = new Map<string, ID>();
    private zoneCache = new Map<string, ID>();

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
    ): Promise<ExecutionResult> {
        let ok = 0;
        let fail = 0;
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
                const enabledRaw = rec[enabledField];
                const enabled = enabledRaw === undefined ? true : Boolean(enabledRaw);

                // Resolve tax category
                const taxCategoryId = await this.resolveTaxCategoryId(
                    ctx,
                    getStringValue(rec, taxCategoryCodeField),
                    getStringValue(rec, taxCategoryIdField),
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
                    getStringValue(rec, zoneCodeField),
                    getStringValue(rec, zoneIdField),
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

                if (existing) {
                    await this.taxRateService.update(ctx, {
                        id: existing.id,
                        name,
                        value,
                        enabled,
                        categoryId: taxCategoryId,
                        zoneId,
                    });
                } else {
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
                    await onRecordError(step.key, getErrorMessage(e) || 'taxRateUpsert failed', rec);
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    private async findExistingByName(ctx: RequestContext, name: string): Promise<{ id: ID } | null> {
        const allRates = await this.taxRateService.findAll(ctx);
        const match = allRates.items.find(tr => tr.name === name);
        return match ? { id: match.id } : null;
    }

    private async resolveTaxCategoryId(
        ctx: RequestContext,
        code?: string,
        idStr?: string,
    ): Promise<ID | null> {
        if (idStr) return idStr as ID;
        if (!code) return null;

        if (this.taxCategoryCache.has(code)) {
            return this.taxCategoryCache.get(code) ?? null;
        }

        const categories = await this.taxCategoryService.findAll(ctx);
        const list = Array.isArray(categories)
            ? categories
            : (categories as unknown as { items: TaxCategory[] }).items || [];
        const match = list.find(
            (tc: TaxCategory) => tc.name.toLowerCase() === code.toLowerCase(),
        );
        if (match) {
            this.taxCategoryCache.set(code, match.id);
            return match.id;
        }
        return null;
    }

    private async resolveZoneId(
        ctx: RequestContext,
        code?: string,
        idStr?: string,
    ): Promise<ID | null> {
        if (idStr) return idStr as ID;
        if (!code) return null;

        if (this.zoneCache.has(code)) {
            return this.zoneCache.get(code) ?? null;
        }

        const zones = await this.zoneService.findAll(ctx);
        const match = zones.items.find(
            z => z.name.toLowerCase() === code.toLowerCase(),
        );
        if (match) {
            this.zoneCache.set(code, match.id);
            return match.id;
        }
        return null;
    }
}
