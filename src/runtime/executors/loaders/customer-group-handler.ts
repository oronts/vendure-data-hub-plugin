/**
 * Customer Group upsert loader handler
 *
 * Bridges LoaderHandler interface to CustomerGroupLoader (BaseEntityLoader).
 * Reads configurable field names from step.config, remaps input records,
 * and delegates to the loader's load() method.
 */
import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig, JsonObject, LoaderContext } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult, SANDBOX_PIPELINE_ID } from '../../executor-types';
import { LoaderHandler } from './types';
import { TARGET_OPERATION, LoadStrategy } from '../../../constants/enums';
import { CustomerGroupLoader } from '../../../loaders/customer-group';
import { CustomerGroupInput } from '../../../loaders/customer-group/types';
import { getStringValue, getArrayValue } from '../../../loaders/shared-helpers';

/**
 * Configuration for the customer group handler step (mirrors loader-handler-registry.ts schema)
 */
interface CustomerGroupHandlerConfig {
    nameField?: string;
    customerEmailsField?: string;
    operation?: string;
    lookupFields?: string[];
    strategy?: LoadStrategy;
}

/**
 * Safely extract config from step.config
 */
function getConfig(config: JsonObject): CustomerGroupHandlerConfig {
    return config as unknown as CustomerGroupHandlerConfig;
}

/**
 * Build a LoaderContext from executor parameters
 */
function mapStrategyToOperation(strategy: LoadStrategy): string {
    switch (strategy) {
        case LoadStrategy.CREATE: return TARGET_OPERATION.CREATE;
        case LoadStrategy.UPDATE: return TARGET_OPERATION.UPDATE;
        default: return TARGET_OPERATION.UPSERT;
    }
}

function buildLoaderContext(ctx: RequestContext, cfg: CustomerGroupHandlerConfig): LoaderContext {
    const operation = cfg.strategy ? mapStrategyToOperation(cfg.strategy) : (cfg.operation ?? TARGET_OPERATION.UPSERT);
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
export class CustomerGroupHandler implements LoaderHandler {
    constructor(
        private customerGroupLoader: CustomerGroupLoader,
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
        const records = input.map(rec => this.remapRecord(rec, cfg)) as CustomerGroupInput[];

        const result = await this.customerGroupLoader.load(loaderContext, records);

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
    private remapRecord(rec: RecordObject, cfg: CustomerGroupHandlerConfig): Record<string, unknown> {
        const nameField = cfg.nameField ?? 'name';
        const customerEmailsField = cfg.customerEmailsField ?? 'customerEmails';

        return {
            name: getStringValue(rec, nameField),
            customerEmails: getArrayValue<string>(rec, customerEmailsField),
            customFields: rec.customFields,
        };
    }
}
