import { Injectable } from '@nestjs/common';
import { RequestContext, UserInputError } from '@vendure/core';
import { StepType, JsonObject, PipelineStepDefinition } from '../../types/index';
import { PAGINATION, TRANSFORM_LIMITS } from '../../constants/index';
import { ExtractExecutor } from '../../runtime/executors/extract.executor';
import { TransformExecutor } from '../../runtime/executors/transform.executor';
import { LoadExecutor } from '../../runtime/executors/load.executor';
import { ExecutorContext, RecordObject } from '../../runtime/executor-types';
import { PipelineExecutionPermissionService } from '../pipeline/pipeline-execution-permission.service';

export interface ExtractPreviewResult {
    records: RecordObject[];
    totalCount: number;
    notes: string[];
}

type TransformSimulationResult = RecordObject[];

export interface ValidateSimulationResult {
    records: RecordObject[];
    summary: {
        input: number;
        passed: number;
        failed: number;
        passRate: number;
    };
}

export interface LoadSimulationResult {
    [key: string]: unknown;
    summary: {
        recordCount: number;
        adapterCode: string;
    };
}

interface ExtractPreviewOptions {
    limit?: number;
}

@Injectable()
export class StepTestService {
    constructor(
        private readonly extractExecutor: ExtractExecutor,
        private readonly transformExecutor: TransformExecutor,
        private readonly loadExecutor: LoadExecutor,
        private readonly executionPermissions: PipelineExecutionPermissionService,
    ) {}

    private createTestExecutorContext(recordLimit?: number): ExecutorContext {
        return {
            cpData: null,
            cpDirty: false,
            markCheckpointDirty: () => {},
            recordLimit,
        };
    }

    private async assertStepAllowed(
        ctx: RequestContext,
        step: PipelineStepDefinition,
    ): Promise<void> {
        await this.executionPermissions.assertAllowed(ctx, {
            version: 1,
            steps: [step],
        });
    }

    private assertRecords(sampleData: unknown): JsonObject[] {
        if (!Array.isArray(sampleData)) {
            throw new Error('records must be an array of JSON objects');
        }
        if (sampleData.length > PAGINATION.MAX_QUERY_LIMIT) {
            throw new Error(`records cannot exceed ${PAGINATION.MAX_QUERY_LIMIT} items`);
        }
        const invalidIndex = sampleData.findIndex(
            record => record === null || typeof record !== 'object' || Array.isArray(record),
        );
        if (invalidIndex !== -1) {
            throw new Error(`records[${invalidIndex}] must be a JSON object`);
        }
        return sampleData as JsonObject[];
    }

    private assertPreviewLimit(limit: number): number {
        if (
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT
        ) {
            throw new UserInputError(
                `limit must be an integer between 1 and ${TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT}`,
            );
        }
        return limit;
    }

    async previewExtract(
        ctx: RequestContext,
        stepInput: JsonObject,
        options: ExtractPreviewOptions = {},
    ): Promise<ExtractPreviewResult> {
        const step = this.createTestStep(StepType.EXTRACT, stepInput);
        const limit = this.assertPreviewLimit(
            options.limit ?? PAGINATION.LIST_PAGE_SIZE,
        );

        await this.assertStepAllowed(ctx, step);
        const preview = await this.extractExecutor.preview(
            ctx,
            step,
            limit,
        );
        const records = preview.records.map(record => record.data as RecordObject);

        return {
            records,
            totalCount: preview.totalAvailable ?? records.length,
            notes: [],
        };
    }

    async simulateTransform(
        ctx: RequestContext,
        stepInput: JsonObject,
        sampleData: unknown,
    ): Promise<TransformSimulationResult> {
        const step = this.createTestStep(StepType.TRANSFORM, stepInput);

        await this.assertStepAllowed(ctx, step);
        const input = this.assertRecords(sampleData);

        return this.transformExecutor.executeOperator(
            ctx,
            step,
            input as RecordObject[],
            this.createTestExecutorContext(),
        );
    }

    async simulateValidate(
        ctx: RequestContext,
        stepInput: JsonObject,
        sampleData: unknown,
    ): Promise<ValidateSimulationResult> {
        const step = this.createTestStep(StepType.VALIDATE, stepInput);

        await this.assertStepAllowed(ctx, step);
        const input = this.assertRecords(sampleData);
        const out = await this.transformExecutor.executeValidate(
            ctx,
            step,
            input as RecordObject[],
        );
        const passed = out.length;
        const failed = input.length - passed;

        return {
            records: out,
            summary: {
                input: input.length,
                passed,
                failed,
                passRate: input.length > 0 ? Math.round((passed / input.length) * 100) : 0,
            },
        };
    }

    async validateLoadConfig(
        ctx: RequestContext,
        stepInput: JsonObject,
        sampleData: unknown,
    ): Promise<LoadSimulationResult> {
        const step = this.createTestStep(StepType.LOAD, stepInput);

        await this.assertStepAllowed(ctx, step);
        const input = this.assertRecords(sampleData);
        const simulation = await this.loadExecutor.simulate(
            ctx,
            step,
            input as RecordObject[],
        );

        return {
            ...simulation,
            summary: {
                recordCount: input.length,
                adapterCode: typeof step.config.adapterCode === 'string'
                    ? step.config.adapterCode
                    : 'unknown',
            },
        };
    }

    private createTestStep(
        type: StepType,
        input: JsonObject,
    ): PipelineStepDefinition {
        if (!isPlainObject(input.config)) {
            throw new UserInputError('step.config must be a JSON object');
        }
        const schemaRef = input.schemaRef === undefined
            ? undefined
            : parseSchemaReference(input.schemaRef);
        if (schemaRef && type !== StepType.EXTRACT && type !== StepType.VALIDATE) {
            throw new UserInputError('step.schemaRef is only valid for EXTRACT or VALIDATE tests');
        }
        return {
            key: `test-${type.toLowerCase()}`,
            type,
            name: `Test ${type}`,
            config: input.config,
            ...(schemaRef ? { schemaRef } : {}),
        };
    }
}

function parseSchemaReference(value: unknown): NonNullable<PipelineStepDefinition['schemaRef']> {
    if (!isPlainObject(value)) {
        throw new UserInputError('step.schemaRef must be a JSON object');
    }
    const { schemaId, version } = value;
    if (
        typeof schemaId !== 'string'
        || schemaId.trim() === ''
        || typeof version !== 'string'
        || version.trim() === ''
    ) {
        throw new UserInputError('step.schemaRef requires schemaId and version');
    }
    return { schemaId, version };
}

function isPlainObject(value: unknown): value is JsonObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
