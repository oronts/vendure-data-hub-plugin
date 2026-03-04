/**
 * Inventory adjust loader handler
 *
 * Bridges LoaderHandler interface to InventoryLoader (BaseEntityLoader).
 * Reads configurable field names from step.config, remaps input records,
 * and delegates to the loader's load() method.
 */
import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig, JsonObject } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { buildSandboxLoaderContext, SandboxHandlerConfig } from '../../executor-helpers';
import { LoaderHandler } from './types';
import { LoadStrategy } from '../../../constants/enums';
import { InventoryLoader } from '../../../loaders/inventory';
import { InventoryInput } from '../../../loaders/inventory/types';
import { getStringValue, getNumberValue } from '../../../loaders/shared-helpers';

/**
 * Configuration for the inventory adjust handler step (mirrors loader-handler-registry.ts schema)
 */
interface InventoryAdjustHandlerConfig extends SandboxHandlerConfig {
    skuField?: string;
    stockOnHandField?: string;
    stockLocationNameField?: string;
    stockLocationIdField?: string;
    reasonField?: string;
    strategy?: LoadStrategy;
}

/**
 * Safely extract config from step.config
 */
function getConfig(config: JsonObject): InventoryAdjustHandlerConfig {
    return config as unknown as InventoryAdjustHandlerConfig;
}

@Injectable()
export class InventoryAdjustHandler implements LoaderHandler {
    constructor(
        private inventoryLoader: InventoryLoader,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        const cfg = getConfig(step.config);
        const loaderContext = buildSandboxLoaderContext(ctx, cfg, ['sku']);

        // Remap input records using configurable field names
        const records = input.map(rec => this.remapRecord(rec, cfg)) as InventoryInput[];

        const result = await this.inventoryLoader.load(loaderContext, records);

        // Report errors through the onRecordError callback
        if (onRecordError && result.errors.length > 0) {
            for (const error of result.errors) {
                await onRecordError(step.key, error.message, error.record as RecordObject);
            }
        }

        return {
            ok: result.succeeded,
            fail: result.failed,
        };
    }

    /**
     * Remap a record from configurable field names to the loader's expected input shape
     */
    private remapRecord(rec: RecordObject, cfg: InventoryAdjustHandlerConfig): Record<string, unknown> {
        const skuField = cfg.skuField ?? 'sku';
        const stockOnHandField = cfg.stockOnHandField ?? 'stockOnHand';
        const stockLocationNameField = cfg.stockLocationNameField ?? 'stockLocationName';
        const stockLocationIdField = cfg.stockLocationIdField ?? 'stockLocationId';
        const reasonField = cfg.reasonField ?? 'reason';

        return {
            sku: getStringValue(rec, skuField),
            stockOnHand: getNumberValue(rec, stockOnHandField),
            stockLocationName: getStringValue(rec, stockLocationNameField),
            stockLocationId: getStringValue(rec, stockLocationIdField),
            reason: getStringValue(rec, reasonField),
        };
    }
}
