/**
 * Order upsert loader handler
 *
 * Bridges LoaderHandler interface to OrderLoader (BaseEntityLoader).
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
import { OrderLoader } from '../../../loaders/order';
import { OrderInput } from '../../../loaders/order/types';
import { getStringValue, getArrayValue, getObjectValue } from '../../../loaders/shared-helpers';

/**
 * Configuration for the order upsert handler step (mirrors loader-handler-registry.ts schema)
 */
interface OrderUpsertHandlerConfig extends SandboxHandlerConfig {
    codeField?: string;
    customerEmailField?: string;
    linesField?: string;
    shippingAddressField?: string;
    billingAddressField?: string;
    shippingMethodCodeField?: string;
    paymentMethodCodeField?: string;
    stateField?: string;
    orderPlacedAtField?: string;
    customFieldsField?: string;
    strategy?: LoadStrategy;
    /** Target state to transition to after creation */
    state?: string;
    /** Payment method code for migration state transitions (auto-resolved if not set) */
    paymentMethodCode?: string;
}

/**
 * Safely extract config from step.config
 */
function getConfig(config: JsonObject): OrderUpsertHandlerConfig {
    return config as unknown as OrderUpsertHandlerConfig;
}

@Injectable()
export class OrderUpsertHandler implements LoaderHandler {
    constructor(
        private orderLoader: OrderLoader,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        const cfg = getConfig(step.config);
        const loaderContext = buildSandboxLoaderContext(ctx, cfg, ['code']);

        // Remap input records using configurable field names
        const records = input.map(rec => this.remapRecord(rec, cfg)) as OrderInput[];

        const result = await this.orderLoader.load(loaderContext, records);

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
    private remapRecord(rec: RecordObject, cfg: OrderUpsertHandlerConfig): Record<string, unknown> {
        const codeField = cfg.codeField ?? 'code';
        const customerEmailField = cfg.customerEmailField ?? 'customerEmail';
        const linesField = cfg.linesField ?? 'lines';
        const shippingAddressField = cfg.shippingAddressField ?? 'shippingAddress';
        const billingAddressField = cfg.billingAddressField ?? 'billingAddress';
        const shippingMethodCodeField = cfg.shippingMethodCodeField ?? 'shippingMethodCode';
        const orderPlacedAtField = cfg.orderPlacedAtField ?? 'orderPlacedAt';
        const customFieldsField = cfg.customFieldsField ?? 'customFields';

        const paymentMethodCodeField = cfg.paymentMethodCodeField ?? 'paymentMethodCode';

        const result: Record<string, unknown> = {
            code: getStringValue(rec, codeField),
            customerEmail: getStringValue(rec, customerEmailField),
            lines: getArrayValue<Record<string, unknown>>(rec, linesField),
            shippingAddress: getObjectValue(rec, shippingAddressField),
            billingAddress: getObjectValue(rec, billingAddressField),
            shippingMethodCode: getStringValue(rec, shippingMethodCodeField),
            orderPlacedAt: getStringValue(rec, orderPlacedAtField),
            customFields: getObjectValue(rec, customFieldsField),
        };

        // Payment method: from record field (dynamic) or step config (static), or auto-resolved by loader
        const paymentFromRecord = getStringValue(rec, paymentMethodCodeField);
        result.paymentMethodCode = paymentFromRecord || cfg.paymentMethodCode;

        // State can come from step config (static) or from record field (dynamic)
        const stateField = cfg.stateField ?? 'state';
        const stateFromRecord = getStringValue(rec, stateField);
        result.state = stateFromRecord || cfg.state;

        return result;
    }
}
