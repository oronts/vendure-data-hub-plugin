import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, RequestContext, Transaction, TransactionalConnection, UserInputError } from '@vendure/core';
import type { JsonObject, PipelineDefinition, HookExecutionResult, HookStageValue, PipelineHooks } from '../../types/index';
import { HookService } from '../../services';
import { Pipeline } from '../../entities/pipeline';
import { DataHubPipelinePermission, RunDataHubPipelinePermission } from '../../permissions';
import { sanitizePipelineDefinitionForOutput } from '../../services/validation/hook-security';
import { HookStage } from '../../constants/enums';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { assertPipelinePermissionsAllowed } from '../../services/pipeline/pipeline-capabilities';

@Resolver()
export class DataHubHookAdminResolver {
    constructor(
        private hooks: HookService,
        private connection: TransactionalConnection,
        private registry: DataHubRegistryService,
    ) {}

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubPipelineHooks(@Ctx() ctx: RequestContext, @Args() args: { pipelineId: ID }): Promise<PipelineHooks> {
        const pipeline = await this.connection.getEntityOrThrow(
            ctx,
            Pipeline,
            args.pipelineId,
            { channelId: ctx.channelId },
        );
        const definition = pipeline.definition as PipelineDefinition | undefined;
        return definition
            ? sanitizePipelineDefinitionForOutput(definition).hooks ?? {}
            : {};
    }

    @Mutation()
    @Transaction()
    @Allow(RunDataHubPipelinePermission.Permission)
    async runDataHubHookTest(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; stage: string; payload?: JsonObject | JsonObject[] },
    ): Promise<HookExecutionResult> {
        const pipeline = await this.connection.getEntityOrThrow(
            ctx,
            Pipeline,
            args.pipelineId,
            { channelId: ctx.channelId },
        );
        const definition = pipeline.definition as PipelineDefinition;
        if (!Object.values(HookStage).includes(args.stage as HookStage)) {
            throw new UserInputError(`Unsupported hook stage: ${args.stage}`);
        }
        const stage = args.stage as HookStageValue;
        assertPipelinePermissionsAllowed(this.registry, ctx, definition);
        return this.hooks.runTest(
            ctx,
            definition,
            stage,
            args.payload,
            pipeline.id,
        );
    }
}
