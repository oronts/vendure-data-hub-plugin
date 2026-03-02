/**
 * Stock Location upsert loader handler
 *
 * Bridges LoaderHandler interface to StockLocationLoader (BaseEntityLoader).
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
import { StockLocationLoader } from '../../../loaders/stock-location';
import { StockLocationInput } from '../../../loaders/stock-location/types';
import { getStringValue } from '../../../loaders/shared-helpers';

/**
 * Configuration for the stock location handler step (mirrors loader-handler-registry.ts schema)
 */
interface StockLocationHandlerConfig extends SandboxHandlerConfig {
    nameField?: string;
    descriptionField?: string;
    strategy?: LoadStrategy;
}

/**
 * Safely extract config from step.config
 */
function getConfig(config: JsonObject): StockLocationHandlerConfig {
    return config as unknown as StockLocationHandlerConfig;
}

@Injectable()
export class StockLocationHandler implements LoaderHandler {
    constructor(
        private stockLocationLoader: StockLocationLoader,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        const cfg = getConfig(step.config);
        const loaderContext = buildSandboxLoaderContext(ctx, cfg, ['name']);

        // Remap input records using configurable field names
        const records = input.map(rec => this.remapRecord(rec, cfg)) as StockLocationInput[];

        const result = await this.stockLocationLoader.load(loaderContext, records);

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
    private remapRecord(rec: RecordObject, cfg: StockLocationHandlerConfig): Record<string, unknown> {
        const nameField = cfg.nameField ?? 'name';
        const descriptionField = cfg.descriptionField ?? 'description';

        return {
            name: getStringValue(rec, nameField),
            description: getStringValue(rec, descriptionField),
            customFields: rec.customFields,
        };
    }
}
