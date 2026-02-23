/**
 * Shipping Method upsert loader handler
 *
 * Bridges LoaderHandler interface to ShippingMethodLoader (BaseEntityLoader).
 * Reads configurable field names from step.config, remaps input records,
 * and delegates to the loader's load() method.
 */
import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig, JsonObject, LoaderContext } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult, SANDBOX_PIPELINE_ID } from '../../executor-types';
import { LoaderHandler } from './types';
import { TARGET_OPERATION } from '../../../constants/enums';
import { ShippingMethodLoader } from '../../../loaders/shipping-method';
import { ShippingMethodInput } from '../../../loaders/shipping-method/types';
import { getStringValue, getObjectValue } from '../../../loaders/shared-helpers';

/**
 * Configuration for the shipping method handler step (mirrors loader-handler-registry.ts schema)
 */
interface ShippingMethodHandlerConfig {
    nameField?: string;
    codeField?: string;
    descriptionField?: string;
    fulfillmentHandlerField?: string;
    calculatorField?: string;
    checkerField?: string;
    operation?: string;
    lookupFields?: string[];
}

/**
 * Safely extract config from step.config
 */
function getConfig(config: JsonObject): ShippingMethodHandlerConfig {
    return config as unknown as ShippingMethodHandlerConfig;
}

/**
 * Build a LoaderContext from executor parameters
 */
function buildLoaderContext(ctx: RequestContext, cfg: ShippingMethodHandlerConfig): LoaderContext {
    const operation = cfg.operation ?? TARGET_OPERATION.UPSERT;
    return {
        ctx,
        pipelineId: SANDBOX_PIPELINE_ID,
        runId: '0',
        operation: operation as LoaderContext['operation'],
        lookupFields: cfg.lookupFields ?? ['code'],
        dryRun: false,
        options: {
            skipDuplicates: false,
        },
    };
}

@Injectable()
export class ShippingMethodHandler implements LoaderHandler {
    constructor(
        private shippingMethodLoader: ShippingMethodLoader,
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
        const records = input.map(rec => this.remapRecord(rec, cfg)) as ShippingMethodInput[];

        const result = await this.shippingMethodLoader.load(loaderContext, records);

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
    private remapRecord(rec: RecordObject, cfg: ShippingMethodHandlerConfig): Record<string, unknown> {
        const nameField = cfg.nameField ?? 'name';
        const codeField = cfg.codeField ?? 'code';
        const descriptionField = cfg.descriptionField ?? 'description';
        const fulfillmentHandlerField = cfg.fulfillmentHandlerField ?? 'fulfillmentHandler';
        const calculatorField = cfg.calculatorField ?? 'calculator';
        const checkerField = cfg.checkerField ?? 'checker';

        return {
            name: getStringValue(rec, nameField),
            code: getStringValue(rec, codeField),
            description: getStringValue(rec, descriptionField),
            fulfillmentHandler: getStringValue(rec, fulfillmentHandlerField),
            calculator: getObjectValue(rec, calculatorField),
            checker: getObjectValue(rec, checkerField),
            customFields: rec.customFields,
        };
    }
}
