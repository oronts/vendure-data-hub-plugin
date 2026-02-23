/**
 * Stock Location upsert loader handler
 *
 * Bridges LoaderHandler interface to StockLocationLoader (BaseEntityLoader).
 * Reads configurable field names from step.config, remaps input records,
 * and delegates to the loader's load() method.
 */
import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig, JsonObject, LoaderContext } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult, SANDBOX_PIPELINE_ID } from '../../executor-types';
import { LoaderHandler } from './types';
import { TARGET_OPERATION } from '../../../constants/enums';
import { StockLocationLoader } from '../../../loaders/stock-location';
import { StockLocationInput } from '../../../loaders/stock-location/types';
import { getStringValue } from '../../../loaders/shared-helpers';

/**
 * Configuration for the stock location handler step (mirrors loader-handler-registry.ts schema)
 */
interface StockLocationHandlerConfig {
    nameField?: string;
    descriptionField?: string;
    operation?: string;
    lookupFields?: string[];
}

/**
 * Safely extract config from step.config
 */
function getConfig(config: JsonObject): StockLocationHandlerConfig {
    return config as unknown as StockLocationHandlerConfig;
}

/**
 * Build a LoaderContext from executor parameters
 */
function buildLoaderContext(ctx: RequestContext, cfg: StockLocationHandlerConfig): LoaderContext {
    const operation = cfg.operation ?? TARGET_OPERATION.UPSERT;
    return {
        ctx,
        pipelineId: SANDBOX_PIPELINE_ID,
        runId: '0',
        operation: operation as LoaderContext['operation'],
        lookupFields: cfg.lookupFields ?? ['name'],
        dryRun: false,
        options: {
            skipDuplicates: false,
        },
    };
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
        const loaderContext = buildLoaderContext(ctx, cfg);

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
