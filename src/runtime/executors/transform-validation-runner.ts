import type { ID, RequestContext } from '@vendure/core';
import { ValidationMode } from '../../constants';
import type { SchemaRegistryService } from '../../services/schema/schema-registry.service';
import { formatSchemaValidationIssues } from '../../services/schema/schema-definition';
import type { DataHubLogger } from '../../services/logger';
import type { DataHubRegistryService } from '../../sdk/registry.service';
import type {
    SdkValidationError,
    ValidateContext,
    ValidatorAdapter,
} from '../../sdk/types';
import type {
    PipelineContext,
    PipelineStepDefinition,
} from '../../types';
import { getAdapterCode } from '../../types/step-configs';
import type {
    OnRecordErrorCallback,
    RecordObject,
} from '../executor-types';
import { SANDBOX_PIPELINE_ID } from '../executor-types';
import {
    type FieldSpec,
    validateAgainstSimpleSpec,
} from '../utils';
import { createLoggerAdapter } from './context-adapters';

interface ValidationStepConfig {
    fields?: Record<string, unknown>;
    rules?: Array<{
        type?: string;
        spec: Record<string, unknown>;
    }>;
    errorHandlingMode?: string;
}

export class TransformValidationRunner {
    constructor(
        private readonly logger: DataHubLogger,
        private readonly registry?: DataHubRegistryService,
        private readonly schemaRegistry?: SchemaRegistryService,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        pipelineContext?: PipelineContext,
        pipelineId?: ID,
    ): Promise<RecordObject[]> {
        const config = (step.config ?? {}) as ValidationStepConfig;
        const mode = config.errorHandlingMode ?? ValidationMode.FAIL_FAST;
        const adapterCode = getAdapterCode(step);
        if (adapterCode) {
            return this.executeCustomValidator(
                ctx,
                step,
                input,
                adapterCode,
                mode === ValidationMode.ACCUMULATE
                    ? 'ACCUMULATE'
                    : 'FAIL_FAST',
                onRecordError,
                pipelineContext,
                pipelineId,
            );
        }

        const schemaValidated = await this.validateSchema(
            ctx,
            step,
            input,
            mode,
            onRecordError,
        );
        const fields = (config.fields ?? {}) as Record<string, FieldSpec>;
        const rules = this.resolveRules(config);
        if (Object.keys(fields).length === 0 && rules.length === 0) {
            return schemaValidated;
        }

        const valid: RecordObject[] = [];
        for (const record of schemaValidated) {
            const errors = [
                ...validateAgainstSimpleSpec(record, fields),
                ...rules.flatMap(rule => validateAgainstSimpleSpec(
                    record,
                    { [rule.field]: rule.spec },
                )),
            ];
            if (errors.length === 0) {
                valid.push(record);
                continue;
            }

            if (onRecordError) {
                await onRecordError(step.key, errors.join('; '), record);
            }
            if (mode === ValidationMode.FAIL_FAST) return [];
        }
        return valid;
    }

    private async validateSchema(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        mode: string,
        onRecordError?: OnRecordErrorCallback,
    ): Promise<RecordObject[]> {
        if (!step.schemaRef) return input;
        if (!this.schemaRegistry) {
            throw new Error('Schema registry is unavailable for validate step');
        }

        const validation = await this.schemaRegistry.validateRecords(
            ctx,
            step.schemaRef,
            input,
        );
        const invalid = validation.records.filter(
            item => item.issues.length > 0,
        );
        if (validation.schema.compatibility === 'PERMISSIVE') {
            if (invalid.length > 0) {
                this.logger.warn(
                    'Permissive schema validation accepted mismatched records',
                    {
                        stepKey: step.key,
                        schemaId: validation.schema.schemaId,
                        schemaVersion: validation.schema.version,
                        recordCount: invalid.length,
                    },
                );
            }
            return input;
        }

        const valid: RecordObject[] = [];
        for (const item of validation.records) {
            if (item.issues.length === 0) {
                valid.push(item.record);
                continue;
            }

            const message = (
                `Schema ${validation.schema.schemaId}` +
                `@${validation.schema.version}: ` +
                formatSchemaValidationIssues(item.issues)
            );
            if (onRecordError) {
                await onRecordError(step.key, message, item.record);
            }
            if (mode === ValidationMode.FAIL_FAST) return [];
        }
        return valid;
    }

    private resolveRules(
        config: ValidationStepConfig,
    ): Array<{ field: string; spec: FieldSpec }> {
        if (!Array.isArray(config.rules)) return [];

        return config.rules.flatMap(rule => {
            const spec = rule.spec;
            if (!spec || typeof spec !== 'object') return [];
            const field = spec['field'];
            if (typeof field !== 'string' || field.length === 0) return [];
            return [{
                field,
                spec: {
                    required: spec['required'] as boolean | undefined,
                    type: spec['type'] as string | undefined,
                    pattern: spec['pattern'] as string | undefined,
                    min: spec['min'] as number | undefined,
                    max: spec['max'] as number | undefined,
                    minLength: spec['minLength'] as number | undefined,
                    maxLength: spec['maxLength'] as number | undefined,
                    enum: spec['enum'] as FieldSpec['enum'],
                    error: spec['error'] as string | undefined,
                },
            }];
        });
    }

    private async executeCustomValidator(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        adapterCode: string,
        mode: ValidateContext['mode'],
        onRecordError?: OnRecordErrorCallback,
        pipelineContext?: PipelineContext,
        pipelineId?: ID,
    ): Promise<RecordObject[]> {
        const adapter = this.registry?.getRuntime(
            'VALIDATOR',
            adapterCode,
        ) as ValidatorAdapter<unknown> | undefined;
        if (!adapter || typeof adapter.validate !== 'function') {
            throw new Error(
                `Validator adapter '${adapterCode}' is not registered ` +
                'for runtime execution',
            );
        }

        const context: ValidateContext = {
            ctx,
            pipelineId: pipelineId ?? SANDBOX_PIPELINE_ID,
            stepKey: step.key,
            pipelineContext: pipelineContext ?? {} as PipelineContext,
            mode,
            logger: createLoggerAdapter(this.logger),
        };
        const result = await adapter.validate(
            context,
            step.config ?? {},
            input,
        );
        if (!Array.isArray(result.valid) || !Array.isArray(result.invalid)) {
            throw new Error(
                `Validator adapter '${adapterCode}' returned an invalid result`,
            );
        }

        const invalid = mode === 'FAIL_FAST'
            ? result.invalid.slice(0, 1)
            : result.invalid;
        for (const item of invalid) {
            const message = item.errors.length > 0
                ? item.errors
                    .map((error: SdkValidationError) => error.message)
                    .join('; ')
                : `Validator '${adapterCode}' rejected the record`;
            if (onRecordError) {
                await onRecordError(step.key, message, item.record);
            }
        }

        return mode === 'FAIL_FAST' && result.invalid.length > 0
            ? []
            : result.valid as RecordObject[];
    }
}
