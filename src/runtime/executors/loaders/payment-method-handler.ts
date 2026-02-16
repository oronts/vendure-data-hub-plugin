/**
 * Payment Method upsert loader handler
 *
 * Reads configurable field names from step.config and upserts PaymentMethod
 * entities via PaymentMethodService. Supports handler and checker configuration.
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    PaymentMethodService,
    ID,
} from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig, JsonObject } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { getErrorMessage } from '../../../utils/error.utils';
import { getStringValue } from '../../../loaders/shared-helpers';

/**
 * Configuration for the payment method handler step (mirrors loader-adapters.ts schema)
 */
interface PaymentMethodHandlerConfig {
    nameField?: string;
    codeField?: string;
    descriptionField?: string;
    enabledField?: string;
    handlerField?: string;
    checkerField?: string;
}

/**
 * Shape of a configurable operation from record data
 */
interface ConfigurableOperationRecord {
    code: string;
    args?: Record<string, unknown>;
}

/**
 * Safely extract config from step.config
 */
function getConfig(config: JsonObject): PaymentMethodHandlerConfig {
    return config as unknown as PaymentMethodHandlerConfig;
}

/**
 * Convert a raw record value to a ConfigurableOperationInput
 */
function toConfigurableOperation(
    value: unknown,
): { code: string; arguments: Array<{ name: string; value: string }> } | null {
    if (!value || typeof value !== 'object') return null;

    const record = value as ConfigurableOperationRecord;
    if (!record.code || typeof record.code !== 'string') return null;

    return {
        code: record.code,
        arguments: Object.entries(record.args || {}).map(([name, val]) => ({
            name,
            value: typeof val === 'string' ? val : JSON.stringify(val),
        })),
    };
}

@Injectable()
export class PaymentMethodHandler implements LoaderHandler {
    constructor(
        private paymentMethodService: PaymentMethodService,
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
                const codeField = cfg.codeField ?? 'code';
                const descriptionField = cfg.descriptionField ?? 'description';
                const enabledField = cfg.enabledField ?? 'enabled';
                const handlerField = cfg.handlerField ?? 'handler';
                const checkerField = cfg.checkerField ?? 'checker';

                const name = getStringValue(rec, nameField);
                const code = getStringValue(rec, codeField);

                if (!name || !code) {
                    fail++;
                    if (onRecordError) {
                        await onRecordError(step.key, 'Missing required field: name or code', rec);
                    }
                    continue;
                }

                const handlerOp = toConfigurableOperation(rec[handlerField]);
                if (!handlerOp) {
                    fail++;
                    if (onRecordError) {
                        await onRecordError(step.key, `Missing or invalid handler for payment method "${code}"`, rec);
                    }
                    continue;
                }

                const description = getStringValue(rec, descriptionField) ?? '';
                const enabledRaw = rec[enabledField];
                const enabled = enabledRaw === undefined ? true : Boolean(enabledRaw);
                const checkerOp = toConfigurableOperation(rec[checkerField]);

                // Find existing by code
                const existing = await this.findExistingByCode(ctx, code);

                if (existing) {
                    const updateInput: Record<string, unknown> = {
                        id: existing.id,
                        code,
                        enabled,
                        handler: handlerOp,
                        translations: [{
                            languageCode: ctx.languageCode,
                            name,
                            description,
                        }],
                    };
                    if (checkerOp) {
                        updateInput.checker = checkerOp;
                    }
                    await this.paymentMethodService.update(
                        ctx,
                        updateInput as Parameters<typeof this.paymentMethodService.update>[1],
                    );
                } else {
                    const createInput: Record<string, unknown> = {
                        code,
                        enabled,
                        handler: handlerOp,
                        translations: [{
                            languageCode: ctx.languageCode,
                            name,
                            description,
                        }],
                    };
                    if (checkerOp) {
                        createInput.checker = checkerOp;
                    }
                    await this.paymentMethodService.create(
                        ctx,
                        createInput as Parameters<typeof this.paymentMethodService.create>[1],
                    );
                }
                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'paymentMethodUpsert failed', rec);
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    private async findExistingByCode(ctx: RequestContext, code: string): Promise<{ id: ID } | null> {
        const methods = await this.paymentMethodService.findAll(ctx, {
            filter: { code: { eq: code } },
        });
        return methods.totalItems > 0 ? { id: methods.items[0].id } : null;
    }
}
