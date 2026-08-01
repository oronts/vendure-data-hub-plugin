import { Injectable } from '@nestjs/common';
import {
    ChannelService,
    ForbiddenError,
    Permission,
    RequestContext,
    RoleService,
} from '@vendure/core';
import type { PipelineDefinition } from '../../types';
import { RunDataHubPipelinePermission } from '../../permissions';
import { DataHubRegistryService } from '../../sdk/registry.service';
import {
    getMissingPipelinePermissions,
    getRequiredPipelinePermissions,
} from './pipeline-capabilities';

export interface PipelineChannelReferences {
    readonly channelIds: string[];
    readonly channelTokens: string[];
    readonly channelCodes: string[];
    readonly hasDynamicChannelAssignment: boolean;
}

export function getPipelineChannelReferences(
    definition: PipelineDefinition,
): PipelineChannelReferences {
    const channelIds = new Set<string>();
    const channelTokens = new Set<string>();
    const channelCodes = new Set<string>();
    const pipelineContext = definition.context;
    let hasDynamicChannelAssignment = false;

    if (pipelineContext?.channel) {
        channelTokens.add(pipelineContext.channel);
    }

    for (const step of definition.steps) {
        if (step.type === 'LOAD') {
            const staticChannel = getNonEmptyString(step.config.channel);
            if (staticChannel) channelCodes.add(staticChannel);
            if (getNonEmptyString(step.config.channelsField)) {
                hasDynamicChannelAssignment = true;
            }
        }
        const strategy = step.context?.channelStrategy
            ?? pipelineContext?.channelStrategy
            ?? 'INHERIT';
        if (strategy === 'INHERIT') continue;

        const effectiveChannelIds = step.context?.channelIds
            ?? pipelineContext?.channelIds
            ?? [];
        effectiveChannelIds.forEach(channelId => channelIds.add(channelId));
    }

    return {
        channelIds: [...channelIds],
        channelTokens: [...channelTokens],
        channelCodes: [...channelCodes],
        hasDynamicChannelAssignment,
    };
}

function getNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : undefined;
}

@Injectable()
export class PipelineExecutionPermissionService {
    constructor(
        private readonly registry: DataHubRegistryService,
        private readonly channelService: ChannelService,
        private readonly roleService: RoleService,
    ) {}

    async assertAllowed(
        ctx: RequestContext,
        definition: PipelineDefinition,
        scopePermission: Permission = RunDataHubPipelinePermission.Permission,
    ): Promise<void> {
        const missing = getMissingPipelinePermissions(
            this.registry,
            ctx,
            definition,
        );
        if (missing.length > 0) {
            throw new ForbiddenError();
        }
        const isSuperAdmin = ctx.userHasPermissions(['SuperAdmin' as Permission]);
        const references = getPipelineChannelReferences(definition);
        if (references.hasDynamicChannelAssignment && !isSuperAdmin) {
            throw new ForbiddenError();
        }
        const targetChannelIds = await this.resolveTargetChannelIds(
            ctx,
            definition,
            references,
        );
        if (isSuperAdmin) return;

        const permissions = [...new Set<string>([
            scopePermission,
            ...getRequiredPipelinePermissions(this.registry, definition),
        ])] as Permission[];
        const deniedChannelIds: string[] = [];
        for (const channelId of targetChannelIds) {
            const allowed = await this.roleService.userHasAllPermissionsOnChannel(
                ctx,
                channelId,
                permissions,
            );
            if (!allowed) deniedChannelIds.push(channelId);
        }
        if (deniedChannelIds.length > 0) {
            throw new ForbiddenError();
        }
    }

    private async resolveTargetChannelIds(
        ctx: RequestContext,
        definition: PipelineDefinition,
        references = getPipelineChannelReferences(definition),
    ): Promise<string[]> {
        const channelIds = new Set<string>();
        if (!definition.context?.channel) {
            if (ctx.channelId === undefined || ctx.channelId === null) {
                throw new Error('Pipeline execution requires an active Vendure channel');
            }
            channelIds.add(String(ctx.channelId));
        }
        for (const channelId of references.channelIds) {
            const channel = await this.channelService.findOne(ctx, channelId);
            if (!channel) throw new Error(`Channel not found: ${channelId}`);
            channelIds.add(String(channel.id));
        }
        for (const token of references.channelTokens) {
            try {
                const channel = await this.channelService.getChannelFromToken(ctx, token);
                channelIds.add(String(channel.id));
            } catch {
                throw new Error('Configured pipeline channel was not found');
            }
        }
        for (const code of references.channelCodes) {
            const channels = await this.channelService.findAll(ctx, {
                filter: { code: { eq: code } },
                take: 1,
            });
            const channel = channels.items[0];
            if (!channel) {
                throw new Error(`Configured loader channel code was not found: ${code}`);
            }
            channelIds.add(String(channel.id));
        }
        return [...channelIds];
    }
}
