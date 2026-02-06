import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    ID,
    RequestContext,
    Transaction,
} from '@vendure/core';
import { SandboxService, SandboxOptions, SandboxResult } from '../../services/versioning';
import {
    RunDataHubPipelinePermission,
} from '../../permissions';
import { PipelineDefinition } from '../../types';
import { RevisionService } from '../../services/versioning';
import { RESOLVER_ERROR_MESSAGES } from '../../constants/index';

interface SandboxWithDefinitionInput {
    definition: PipelineDefinition;
    options?: SandboxOptions;
}

interface SandboxComparisonResult {
    before: SandboxResult;
    after: SandboxResult;
    summary: {
        stepsChanged: number;
        recordsAffected: number;
        successCountDelta: number;
        failureCountDelta: number;
        filteredCountDelta: number;
        durationDeltaMs: number;
    };
    changedSteps: Array<{
        stepKey: string;
        stepName: string;
        recordsOutBefore: number;
        recordsOutAfter: number;
        durationBefore: number;
        durationAfter: number;
        fieldChanges: string[];
    }>;
}

const DEFAULT_MAX_RECORDS = 100;
const MAX_COMPARISON_RECORDS = 10000;

@Resolver()
export class DataHubSandboxResolver {
    constructor(
        private sandboxService: SandboxService,
        private revisionService: RevisionService,
    ) {}

    @Query()
    @Allow(RunDataHubPipelinePermission.Permission)
    async dataHubSandbox(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; options?: SandboxOptions },
    ): Promise<SandboxResult> {
        return this.sandboxService.execute(ctx, args.pipelineId, args.options);
    }

    @Query()
    @Allow(RunDataHubPipelinePermission.Permission)
    async dataHubSandboxWithDefinition(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: SandboxWithDefinitionInput },
    ): Promise<SandboxResult> {
        return this.sandboxService.executeWithDefinition(
            ctx,
            args.input.definition,
            args.input.options,
        );
    }

    @Query()
    @Allow(RunDataHubPipelinePermission.Permission)
    async dataHubCompareSandboxResults(
        @Ctx() ctx: RequestContext,
        @Args() args: {
            pipelineId: ID;
            fromRevisionId: ID;
            toRevisionId: ID;
            options?: SandboxOptions;
        },
    ): Promise<SandboxComparisonResult> {
        const fromRevision = await this.revisionService.getRevision(ctx, args.fromRevisionId);
        const toRevision = await this.revisionService.getRevision(ctx, args.toRevisionId);

        if (!fromRevision || !toRevision) {
            throw new Error(RESOLVER_ERROR_MESSAGES.REVISION_NOT_FOUND);
        }

        // Add a reasonable limit check before comparison
        const options = {
            ...args.options,
            maxRecords: Math.min(args.options?.maxRecords ?? MAX_COMPARISON_RECORDS, MAX_COMPARISON_RECORDS),
        };

        const [beforeResult, afterResult] = await Promise.all([
            this.sandboxService.executeWithDefinition(ctx, fromRevision.definition, options),
            this.sandboxService.executeWithDefinition(ctx, toRevision.definition, options),
        ]);

        return this.compareResults(beforeResult, afterResult);
    }

    @Query()
    @Allow(RunDataHubPipelinePermission.Permission)
    async dataHubRecordLineageDetail(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; recordIndex: number; options?: SandboxOptions },
    ) {
        const result = await this.sandboxService.execute(ctx, args.pipelineId, {
            ...args.options,
            includeLineage: true,
            maxRecords: Math.max((args.options?.maxRecords || DEFAULT_MAX_RECORDS), args.recordIndex + 1),
        });

        return result.dataLineage.find(l => l.recordIndex === args.recordIndex) || null;
    }

    @Query()
    @Allow(RunDataHubPipelinePermission.Permission)
    async dataHubLoadPreview(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; options?: SandboxOptions },
    ) {
        const result = await this.sandboxService.execute(ctx, args.pipelineId, args.options);
        return result.loadPreviews;
    }

    @Mutation()
    @Transaction()
    @Allow(RunDataHubPipelinePermission.Permission)
    async dataHubTestWithSeedData(
        @Ctx() ctx: RequestContext,
        @Args() args: {
            pipelineId: ID;
            seedData: Record<string, unknown>[];
            options?: SandboxOptions;
        },
    ): Promise<SandboxResult> {
        return this.sandboxService.execute(ctx, args.pipelineId, {
            ...args.options,
            seedData: args.seedData,
        });
    }

    @Mutation()
    @Transaction()
    @Allow(RunDataHubPipelinePermission.Permission)
    async dataHubReplayStep(
        @Ctx() ctx: RequestContext,
        @Args() args: {
            pipelineId: ID;
            stepKey: string;
            inputData: Record<string, unknown>[];
            options?: SandboxOptions;
        },
    ) {
        const result = await this.sandboxService.execute(ctx, args.pipelineId, {
            ...args.options,
            seedData: args.inputData,
            startFromStep: args.stepKey,
        });

        const stepResult = result.steps.find(s => s.stepKey === args.stepKey);
        if (!stepResult) {
            throw new Error(RESOLVER_ERROR_MESSAGES.STEP_NOT_FOUND(args.stepKey));
        }

        return stepResult;
    }

    private compareResults(before: SandboxResult, after: SandboxResult): SandboxComparisonResult {
        const changedSteps: SandboxComparisonResult['changedSteps'] = [];

        const beforeStepsMap = new Map(before.steps.map(s => [s.stepKey, s]));
        const afterStepsMap = new Map(after.steps.map(s => [s.stepKey, s]));

        const allStepKeys = new Set([
            ...before.steps.map(s => s.stepKey),
            ...after.steps.map(s => s.stepKey),
        ]);

        for (const stepKey of allStepKeys) {
            const beforeStep = beforeStepsMap.get(stepKey);
            const afterStep = afterStepsMap.get(stepKey);

            let hasChanged = false;
            const fieldChanges: string[] = [];

            if (!beforeStep || !afterStep) {
                hasChanged = true;
                if (!beforeStep) fieldChanges.push('step_added');
                if (!afterStep) fieldChanges.push('step_removed');
            } else {
                if (beforeStep.recordsOut !== afterStep.recordsOut) {
                    hasChanged = true;
                    fieldChanges.push('records_out_changed');
                }
                if (beforeStep.recordsFiltered !== afterStep.recordsFiltered) {
                    hasChanged = true;
                    fieldChanges.push('filtered_count_changed');
                }
                if (beforeStep.recordsErrored !== afterStep.recordsErrored) {
                    hasChanged = true;
                    fieldChanges.push('error_count_changed');
                }
                if (beforeStep.status !== afterStep.status) {
                    hasChanged = true;
                    fieldChanges.push('status_changed');
                }

                const beforeFields = new Set(beforeStep.fieldChanges.map(fc => fc.field));
                const afterFields = new Set(afterStep.fieldChanges.map(fc => fc.field));

                for (const field of afterFields) {
                    if (!beforeFields.has(field)) {
                        hasChanged = true;
                        fieldChanges.push(`field_${field}_added`);
                    }
                }
                for (const field of beforeFields) {
                    if (!afterFields.has(field)) {
                        hasChanged = true;
                        fieldChanges.push(`field_${field}_removed`);
                    }
                }
            }

            if (hasChanged) {
                changedSteps.push({
                    stepKey,
                    stepName: afterStep?.stepName || beforeStep?.stepName || stepKey,
                    recordsOutBefore: beforeStep?.recordsOut || 0,
                    recordsOutAfter: afterStep?.recordsOut || 0,
                    durationBefore: beforeStep?.durationMs || 0,
                    durationAfter: afterStep?.durationMs || 0,
                    fieldChanges,
                });
            }
        }

        return {
            before,
            after,
            summary: {
                stepsChanged: changedSteps.length,
                recordsAffected: this.calculateAffectedRecords(before, after),
                successCountDelta: after.metrics.totalRecordsSucceeded - before.metrics.totalRecordsSucceeded,
                failureCountDelta: after.metrics.totalRecordsFailed - before.metrics.totalRecordsFailed,
                filteredCountDelta: after.metrics.totalRecordsFiltered - before.metrics.totalRecordsFiltered,
                durationDeltaMs: after.totalDurationMs - before.totalDurationMs,
            },
            changedSteps,
        };
    }

    private calculateAffectedRecords(before: SandboxResult, after: SandboxResult): number {
        const metricsDiff = Math.abs(
            after.metrics.totalRecordsSucceeded - before.metrics.totalRecordsSucceeded
        ) + Math.abs(
            after.metrics.totalRecordsFailed - before.metrics.totalRecordsFailed
        ) + Math.abs(
            after.metrics.totalRecordsFiltered - before.metrics.totalRecordsFiltered
        );

        return Math.min(metricsDiff, Math.max(
            before.metrics.totalRecordsProcessed,
            after.metrics.totalRecordsProcessed
        ));
    }
}
