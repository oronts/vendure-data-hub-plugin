import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    ID,
    RequestContext,
} from '@vendure/core';
import { SandboxService, SandboxOptions, SandboxResult } from '../../services/versioning';
import {
    DataHubPipelinePermission,
    RunDataHubPipelinePermission,
} from '../../permissions';
import { PipelineDefinition } from '../../types';
import { RevisionService } from '../../services/versioning';

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

@Resolver()
export class DataHubSandboxResolver {
    constructor(
        private sandboxService: SandboxService,
        private revisionService: RevisionService,
    ) {}

    // SANDBOX QUERIES

    /**
     * Execute a comprehensive sandbox/dry run for a pipeline
     */
    @Query()
    @Allow(RunDataHubPipelinePermission.Permission)
    async dataHubSandbox(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; options?: SandboxOptions },
    ): Promise<SandboxResult> {
        return this.sandboxService.execute(ctx, args.pipelineId, args.options);
    }

    /**
     * Execute sandbox with a custom definition (for testing unpublished changes)
     */
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

    /**
     * Compare sandbox results between two pipeline revisions
     */
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
        // Get both revisions
        const fromRevision = await this.revisionService.getRevision(ctx, args.fromRevisionId);
        const toRevision = await this.revisionService.getRevision(ctx, args.toRevisionId);

        if (!fromRevision || !toRevision) {
            throw new Error('One or both revisions not found');
        }

        // Run sandbox on both definitions
        const [beforeResult, afterResult] = await Promise.all([
            this.sandboxService.executeWithDefinition(ctx, fromRevision.definition, args.options),
            this.sandboxService.executeWithDefinition(ctx, toRevision.definition, args.options),
        ]);

        // Compare results
        return this.compareResults(beforeResult, afterResult);
    }

    /**
     * Get detailed record lineage for a specific record
     */
    @Query()
    @Allow(RunDataHubPipelinePermission.Permission)
    async dataHubRecordLineageDetail(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; recordIndex: number; options?: SandboxOptions },
    ) {
        const result = await this.sandboxService.execute(ctx, args.pipelineId, {
            ...args.options,
            includeLineage: true,
            maxRecords: Math.max((args.options?.maxRecords || 100), args.recordIndex + 1),
        });

        return result.dataLineage.find(l => l.recordIndex === args.recordIndex) || null;
    }

    /**
     * Preview load operations for a pipeline
     */
    @Query()
    @Allow(RunDataHubPipelinePermission.Permission)
    async dataHubLoadPreview(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; options?: SandboxOptions },
    ) {
        const result = await this.sandboxService.execute(ctx, args.pipelineId, args.options);
        return result.loadPreviews;
    }

    // SANDBOX MUTATIONS

    /**
     * Execute sandbox with custom seed data for testing specific scenarios
     */
    @Mutation()
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

    /**
     * Replay a specific step with custom input
     */
    @Mutation()
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

        // Return just the step result
        const stepResult = result.steps.find(s => s.stepKey === args.stepKey);
        if (!stepResult) {
            throw new Error(`Step ${args.stepKey} not found in execution results`);
        }

        return stepResult;
    }

    // Private helpers

    private compareResults(before: SandboxResult, after: SandboxResult): SandboxComparisonResult {
        const changedSteps: SandboxComparisonResult['changedSteps'] = [];

        // Create maps for easy lookup
        const beforeStepsMap = new Map(before.steps.map(s => [s.stepKey, s]));
        const afterStepsMap = new Map(after.steps.map(s => [s.stepKey, s]));

        // Find all unique step keys
        const allStepKeys = new Set([
            ...before.steps.map(s => s.stepKey),
            ...after.steps.map(s => s.stepKey),
        ]);

        for (const stepKey of allStepKeys) {
            const beforeStep = beforeStepsMap.get(stepKey);
            const afterStep = afterStepsMap.get(stepKey);

            // Determine if step changed
            let hasChanged = false;
            const fieldChanges: string[] = [];

            if (!beforeStep || !afterStep) {
                hasChanged = true;
                if (!beforeStep) fieldChanges.push('step_added');
                if (!afterStep) fieldChanges.push('step_removed');
            } else {
                // Compare outputs
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

                // Compare field changes
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
        // A rough estimate of how many records would be processed differently
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
