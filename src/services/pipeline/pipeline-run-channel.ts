import {
    ConfigService,
    RequestContext,
    RequestContextService,
    User,
    UserService,
} from '@vendure/core';
import { ConfigurationSource } from '../../constants/enums';
import { PipelineRun } from '../../entities/pipeline';

export interface PipelineRunChannel {
    channelId: string;
    channelToken: string;
}

export function getActivePipelineRunChannelId(ctx: RequestContext): string {
    const channelId = ctx.channelId;
    if (
        (typeof channelId !== 'string' && typeof channelId !== 'number')
        || String(channelId).trim().length === 0
    ) {
        throw new Error('Data Hub run access requires an active Vendure channel');
    }
    return String(channelId);
}

export function getPipelineRunChannel(ctx: RequestContext): PipelineRunChannel {
    const channelId = getActivePipelineRunChannelId(ctx);
    const channelToken = ctx.channel?.token;

    if (
        typeof channelToken !== 'string'
        || channelToken.trim().length === 0
    ) {
        throw new Error('Pipeline execution requires an active Vendure channel');
    }

    return {
        channelId,
        channelToken,
    };
}

export async function createPipelineRunContext(
    requestContextService: RequestContextService,
    userService: UserService,
    configService: ConfigService,
    lookupCtx: RequestContext,
    run: PipelineRun,
): Promise<RequestContext> {
    if (!run.channelId || !run.channelToken) {
        throw new Error(
            `Pipeline run ${String(run.id)} has no persisted execution channel`,
        );
    }

    const user = await resolvePipelineRunUser(
        userService,
        configService,
        lookupCtx,
        run,
    );
    const ctx = await requestContextService.create({
        apiType: 'admin',
        channelOrToken: run.channelToken,
        user,
    });

    if (String(ctx.channelId) !== run.channelId) {
        throw new Error(
            `Pipeline run ${String(run.id)} channel mismatch: expected ${run.channelId}, resolved ${String(ctx.channelId)}`,
        );
    }

    return ctx;
}

async function resolvePipelineRunUser(
    userService: UserService,
    configService: ConfigService,
    lookupCtx: RequestContext,
    run: PipelineRun,
): Promise<User> {
    const userId = run.startedByUserId ?? run.pipeline?.publishedByUserId;
    if (userId != null) {
        const user = await userService.getUserById(lookupCtx, userId);
        if (!user) {
            throw new Error(
                `Pipeline run ${String(run.id)} references missing execution user ${String(userId)}`,
            );
        }
        return user;
    }

    if (run.pipeline?.configurationSource !== ConfigurationSource.CODE_FIRST) {
        throw new Error(
            `Pipeline run ${String(run.id)} has no persisted execution user`,
        );
    }

    const configuredIdentifier = configService.authOptions.superadminCredentials.identifier;
    const user = await userService.getUserByEmailAddress(
        lookupCtx,
        configuredIdentifier,
        'administrator',
    );
    if (!user) {
        throw new Error(
            `Pipeline run ${String(run.id)} cannot resolve configured execution user ${configuredIdentifier}`,
        );
    }
    return user;
}
