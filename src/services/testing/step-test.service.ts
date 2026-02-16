import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { StepType, JsonObject, PipelineStepDefinition, ExecutorContext } from '../../types/index';
import { PAGINATION } from '../../constants/index';
import { ExtractExecutor } from '../../runtime/executors/extract.executor';
import { TransformExecutor } from '../../runtime/executors/transform.executor';
import { LoadExecutor } from '../../runtime/executors/load.executor';
import { RecordObject } from '../../runtime/executor-types';

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
    ) {}

    private createTestExecutorContext(): ExecutorContext {
        return {
            cpData: null,
            cpDirty: false,
            markCheckpointDirty: () => {},
        };
    }

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

    /** Dry-run simulation of load step without persisting data */
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
