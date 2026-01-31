import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { StepType, JsonObject, PipelineStepDefinition, ExecutorContext } from '../../types/index';
import { PAGINATION } from '../../constants/index';
import { ExtractExecutor } from '../../runtime/executors/extract.executor';
import { TransformExecutor } from '../../runtime/executors/transform.executor';
import { LoadExecutor } from '../../runtime/executors/load.executor';
import { RecordObject } from '../../runtime/executor-types';

/**
 * Result of a preview extract operation
 */
export interface ExtractPreviewResult {
    records: RecordObject[];
    totalCount: number;
    notes: string[];
}

/**
 * Result of a simulate transform operation
 */
export type TransformSimulationResult = RecordObject[];

/**
 * Result of a simulate validate operation
 */
export interface ValidateSimulationResult {
    records: RecordObject[];
    summary: {
        input: number;
        passed: number;
        failed: number;
        passRate: number;
    };
}

/**
 * Result of a simulate load operation
 */
export interface LoadSimulationResult {
    [key: string]: unknown;
    summary: {
        recordCount: number;
        adapterCode: string;
    };
}

/**
 * Options for extract preview
 */
export interface ExtractPreviewOptions {
    /** Maximum number of records to return */
    limit?: number;
}

/**
 * StepTestService - Service layer for testing individual pipeline steps
 *
 * This service provides methods for previewing and simulating pipeline step
 * execution without running the full pipeline. It acts as an intermediary
 * between the API layer (resolvers) and the runtime layer (executors).
 *
 * Architecture: api/ -> services/ -> runtime/
 */
@Injectable()
export class StepTestService {
    constructor(
        private readonly extractExecutor: ExtractExecutor,
        private readonly transformExecutor: TransformExecutor,
        private readonly loadExecutor: LoadExecutor,
    ) {}

    /**
     * Creates a minimal executor context for testing purposes
     */
    private createTestExecutorContext(): ExecutorContext {
        return {
            cpData: null,
            cpDirty: false,
            markCheckpointDirty: () => {},
        };
    }

    /**
     * Preview an extract step by executing it with optional limit
     *
     * @param ctx - Vendure request context
     * @param stepConfig - The step configuration (extract adapter settings)
     * @param options - Preview options (limit)
     * @returns Preview result with records, total count, and notes
     */
    async previewExtract(
        ctx: RequestContext,
        stepConfig: JsonObject,
        options: ExtractPreviewOptions = {},
    ): Promise<ExtractPreviewResult> {
        const step: PipelineStepDefinition = {
            key: 'test-extract',
            type: StepType.EXTRACT,
            name: 'Test Extract',
            config: stepConfig ?? {},
        };

        const executorCtx = this.createTestExecutorContext();
        const records = await this.extractExecutor.execute(ctx, step, executorCtx);

        const limit = typeof options.limit === 'number' ? options.limit : PAGINATION.LIST_PAGE_SIZE;

        return {
            records: records.slice(0, Math.max(0, limit)),
            totalCount: records.length,
            notes: [],
        };
    }

    /**
     * Simulate a transform step on sample data
     *
     * @param ctx - Vendure request context
     * @param stepConfig - The step configuration (transform adapter settings)
     * @param sampleData - Sample records to transform
     * @returns Transformed records
     */
    async simulateTransform(
        ctx: RequestContext,
        stepConfig: JsonObject,
        sampleData: JsonObject[],
    ): Promise<TransformSimulationResult> {
        const step: PipelineStepDefinition = {
            key: 'test-transform',
            type: StepType.TRANSFORM,
            name: 'Test Transform',
            config: stepConfig ?? {},
        };

        const input = Array.isArray(sampleData) ? sampleData : [];
        const executorCtx = this.createTestExecutorContext();

        return await this.transformExecutor.executeOperator(
            ctx,
            step,
            input as RecordObject[],
            executorCtx,
        );
    }

    /**
     * Simulate a validate step on sample data
     *
     * @param ctx - Vendure request context
     * @param stepConfig - The step configuration (validation rules)
     * @param sampleData - Sample records to validate
     * @returns Validation result with passed records and summary
     */
    async simulateValidate(
        ctx: RequestContext,
        stepConfig: JsonObject,
        sampleData: JsonObject[],
    ): Promise<ValidateSimulationResult> {
        const step: PipelineStepDefinition = {
            key: 'test-validate',
            type: StepType.VALIDATE,
            name: 'Test Validate',
            config: stepConfig ?? {},
        };

        const input = Array.isArray(sampleData) ? sampleData : [];

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

    /**
     * Validate and simulate a load step configuration
     *
     * This performs a dry-run simulation of what the load step would do
     * without actually persisting any data.
     *
     * @param ctx - Vendure request context
     * @param stepConfig - The step configuration (loader adapter settings)
     * @param sampleData - Sample records to simulate loading
     * @returns Simulation result with what would be created/updated
     */
    async validateLoadConfig(
        ctx: RequestContext,
        stepConfig: JsonObject,
        sampleData: JsonObject[],
    ): Promise<LoadSimulationResult> {
        const step: PipelineStepDefinition = {
            key: 'test-load',
            type: StepType.LOAD,
            name: 'Test Load',
            config: stepConfig ?? {},
        };

        const input = Array.isArray(sampleData) ? sampleData : [];
        const simulation = await this.loadExecutor.simulate(
            ctx,
            step,
            input as RecordObject[],
        );

        return {
            ...simulation,
            summary: {
                recordCount: input.length,
                adapterCode: (stepConfig as JsonObject)?.adapterCode as string || 'unknown',
            },
        };
    }
}
