import { describe, expect, it, vi } from 'vitest';
import type {
    ConfigService,
    RequestContext,
    RequestContextService,
    User,
    UserService,
} from '@vendure/core';
import { ConfigurationSource } from '../../constants/enums';
import { PipelineRun } from '../../entities/pipeline';
import {
    createPipelineRunContext,
    getActivePipelineRunChannelId,
    getPipelineRunChannel,
} from './pipeline-run-channel';

describe('pipeline run channel context', () => {
    const lookupCtx = {} as RequestContext;
    const configService = {
        authOptions: {
            superadminCredentials: { identifier: 'superadmin' },
        },
    } as ConfigService;

    function createUserService(user?: User) {
        return {
            getUserById: vi.fn(async () => user),
            getUserByEmailAddress: vi.fn(async () => user),
        };
    }

    it('normalizes the active channel ID for read and mutation scopes', () => {
        expect(getActivePipelineRunChannelId({ channelId: 17 } as RequestContext))
            .toBe('17');
    });

    it('fails closed when a run access has no active channel', () => {
        expect(() => getActivePipelineRunChannelId({} as RequestContext))
            .toThrow('Data Hub run access requires an active Vendure channel');
    });

    it('captures the initiating channel ID and token', () => {
        const ctx = {
            channelId: 17,
            channel: { token: 'private-channel' },
        } as RequestContext;

        expect(getPipelineRunChannel(ctx)).toEqual({
            channelId: '17',
            channelToken: 'private-channel',
        });
    });

    it('rejects run creation without a complete active channel', () => {
        expect(() => getPipelineRunChannel({ channelId: 17 } as RequestContext))
            .toThrow('Pipeline execution requires an active Vendure channel');
    });

    it('restores the configured superadmin for a run without a persisted identity', async () => {
        const resolved = { channelId: 17 } as RequestContext;
        const user = { id: 1, roles: [] } as unknown as User;
        const requestContextService = {
            create: vi.fn(async () => resolved),
        };
        const run = Object.assign(new PipelineRun(), {
            id: 42,
            channelId: '17',
            channelToken: 'private-channel',
            startedByUserId: null,
            pipeline: {
                publishedByUserId: null,
                configurationSource: ConfigurationSource.CODE_FIRST,
            },
        });
        const userService = createUserService(user);

        await expect(createPipelineRunContext(
            requestContextService as unknown as RequestContextService,
            userService as unknown as UserService,
            configService,
            lookupCtx,
            run,
        )).resolves.toBe(resolved);
        expect(requestContextService.create).toHaveBeenCalledWith({
            apiType: 'admin',
            channelOrToken: 'private-channel',
            user,
        });
        expect(userService.getUserById).not.toHaveBeenCalled();
        expect(userService.getUserByEmailAddress).toHaveBeenCalledWith(
            lookupCtx,
            'superadmin',
            'administrator',
        );
    });

    it('restores the initiating user with Vendure channel permissions', async () => {
        const resolved = { channelId: 17 } as RequestContext;
        const user = { id: 11, roles: [] } as unknown as User;
        const requestContextService = { create: vi.fn(async () => resolved) };
        const userService = createUserService(user);
        const run = Object.assign(new PipelineRun(), {
            id: 42,
            channelId: '17',
            channelToken: 'private-channel',
            startedByUserId: '11',
            pipeline: { publishedByUserId: '12' },
        });

        await expect(createPipelineRunContext(
            requestContextService as unknown as RequestContextService,
            userService as unknown as UserService,
            configService,
            lookupCtx,
            run,
        )).resolves.toBe(resolved);
        expect(userService.getUserById).toHaveBeenCalledWith(lookupCtx, '11');
        expect(requestContextService.create).toHaveBeenCalledWith({
            apiType: 'admin',
            channelOrToken: 'private-channel',
            user,
        });
    });

    it('uses the publisher identity for an automated run', async () => {
        const resolved = { channelId: 17 } as RequestContext;
        const user = { id: 12, roles: [] } as unknown as User;
        const requestContextService = { create: vi.fn(async () => resolved) };
        const userService = createUserService(user);
        const run = Object.assign(new PipelineRun(), {
            id: 42,
            channelId: '17',
            channelToken: 'private-channel',
            startedByUserId: null,
            pipeline: { publishedByUserId: '12' },
        });

        await createPipelineRunContext(
            requestContextService as unknown as RequestContextService,
            userService as unknown as UserService,
            configService,
            lookupCtx,
            run,
        );
        expect(userService.getUserById).toHaveBeenCalledWith(lookupCtx, '12');
    });

    it('fails closed when the referenced execution user no longer exists', async () => {
        const requestContextService = { create: vi.fn() };
        const userService = createUserService();
        const run = Object.assign(new PipelineRun(), {
            id: 42,
            channelId: '17',
            channelToken: 'private-channel',
            startedByUserId: '11',
            pipeline: { publishedByUserId: '12' },
        });

        await expect(createPipelineRunContext(
            requestContextService as unknown as RequestContextService,
            userService as unknown as UserService,
            configService,
            lookupCtx,
            run,
        )).rejects.toThrow(
            'Pipeline run 42 references missing execution user 11',
        );
        expect(requestContextService.create).not.toHaveBeenCalled();
    });

    it('fails closed when the configured execution user cannot be resolved', async () => {
        const requestContextService = { create: vi.fn() };
        const run = Object.assign(new PipelineRun(), {
            id: 42,
            channelId: '17',
            channelToken: 'private-channel',
            startedByUserId: null,
            pipeline: {
                publishedByUserId: null,
                configurationSource: ConfigurationSource.CODE_FIRST,
            },
        });

        await expect(createPipelineRunContext(
            requestContextService as unknown as RequestContextService,
            createUserService() as unknown as UserService,
            configService,
            lookupCtx,
            run,
        )).rejects.toThrow(
            'Pipeline run 42 cannot resolve configured execution user superadmin',
        );
        expect(requestContextService.create).not.toHaveBeenCalled();
    });

    it('fails closed for an unowned database pipeline run', async () => {
        const requestContextService = { create: vi.fn() };
        const userService = createUserService({ id: 1 } as User);
        const run = Object.assign(new PipelineRun(), {
            id: 42,
            channelId: '17',
            channelToken: 'private-channel',
            startedByUserId: null,
            pipeline: {
                publishedByUserId: null,
                configurationSource: ConfigurationSource.DATABASE,
            },
        });

        await expect(createPipelineRunContext(
            requestContextService as unknown as RequestContextService,
            userService as unknown as UserService,
            configService,
            lookupCtx,
            run,
        )).rejects.toThrow(
            'Pipeline run 42 has no persisted execution user',
        );
        expect(userService.getUserByEmailAddress).not.toHaveBeenCalled();
        expect(requestContextService.create).not.toHaveBeenCalled();
    });

    it('rejects a token that resolves to a different channel', async () => {
        const requestContextService = {
            create: vi.fn(async () => ({ channelId: 23 } as RequestContext)),
        };
        const run = Object.assign(new PipelineRun(), {
            id: 42,
            channelId: '17',
            channelToken: 'private-channel',
            startedByUserId: null,
            pipeline: {
                publishedByUserId: null,
                configurationSource: ConfigurationSource.CODE_FIRST,
            },
        });

        await expect(createPipelineRunContext(
            requestContextService as unknown as RequestContextService,
            createUserService({ id: 1 } as User) as unknown as UserService,
            configService,
            lookupCtx,
            run,
        )).rejects.toThrow(
            'Pipeline run 42 channel mismatch: expected 17, resolved 23',
        );
    });
});
