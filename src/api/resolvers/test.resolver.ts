import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext } from '@vendure/core';
import { RunDataHubPipelinePermission } from '../../permissions';
import { ExtractExecutor } from '../../runtime/executors/extract.executor';
import { TransformExecutor as RuntimeTransformExecutor } from '../../runtime/executors/transform.executor';
import { LoadExecutor } from '../../runtime/executors/load.executor';
import { StepType } from '../../types/index';

@Resolver()
export class DataHubTestAdminResolver {
    constructor(
        private extractExecutor: ExtractExecutor,
        private transformExecutor: RuntimeTransformExecutor,
        private loadExecutor: LoadExecutor,
    ) {}

    private makeCtx(): { cpData: any; cpDirty: boolean; markCheckpointDirty: () => void } {
        return { cpData: null, cpDirty: false, markCheckpointDirty: () => {} };
    }

    /**
     * Preview extract step - runs the extractor and returns sample records
     */
    @Mutation()
    @Allow(RunDataHubPipelinePermission.Permission)
    async previewDataHubExtract(
        @Ctx() ctx: RequestContext,
        @Args() args: { step: any; limit?: number },
    ) {
        const step = {
            key: 'test-extract',
            type: StepType.EXTRACT,
            name: 'Test Extract',
            config: args.step ?? {},
        } as any;
        const records = await this.extractExecutor.execute(ctx, step, this.makeCtx());
        const limit = typeof args.limit === 'number' ? args.limit : 20;
        return {
            records: records.slice(0, Math.max(0, limit)),
            totalCount: records.length,
            notes: [],
        };
    }

    /**
     * Simulate transform step - applies transforms to input records
     */
    @Mutation()
    @Allow(RunDataHubPipelinePermission.Permission)
    async simulateDataHubTransform(
        @Ctx() ctx: RequestContext,
        @Args() args: { step: any; records: any[] },
    ) {
        const step = {
            key: 'test-transform',
            type: StepType.TRANSFORM,
            name: 'Test Transform',
            config: args.step ?? {},
        } as any;
        const input = Array.isArray(args.records) ? args.records : [];
        const out = await this.transformExecutor.executeOperator(ctx, step, input, this.makeCtx());
        return out;
    }

    /**
     * Simulate validate step - runs validation rules on input records
     */
    @Mutation()
    @Allow(RunDataHubPipelinePermission.Permission)
    async simulateDataHubValidate(
        @Ctx() ctx: RequestContext,
        @Args() args: { step: any; records: any[] },
    ) {
        const step = {
            key: 'test-validate',
            type: StepType.VALIDATE,
            name: 'Test Validate',
            config: args.step ?? {},
        } as any;
        const input = Array.isArray(args.records) ? args.records : [];

        // Use the transform executor's validation method
        const out = await this.transformExecutor.executeValidate(ctx, step, input);

        // Return validation results with pass/fail info
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
     * Simulate load step - checks what would be created/updated without writing
     */
    @Mutation()
    @Allow(RunDataHubPipelinePermission.Permission)
    async simulateDataHubLoad(
        @Ctx() ctx: RequestContext,
        @Args() args: { step: any; records: any[] },
    ) {
        const step = {
            key: 'test-load',
            type: StepType.LOAD,
            name: 'Test Load',
            config: args.step ?? {},
        } as any;
        const input = Array.isArray(args.records) ? args.records : [];
        const simulation = await this.loadExecutor.simulate(ctx, step, input);

        // Enhance simulation result with summary
        return {
            ...simulation,
            summary: {
                recordCount: input.length,
                adapterCode: (args.step as any)?.adapterCode || 'unknown',
            },
        };
    }
}

