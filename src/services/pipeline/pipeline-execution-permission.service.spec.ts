import { ForbiddenError, type Permission, type RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import { AdapterType, StepType } from '../../constants/enums';
import type { AdapterDefinition } from '../../sdk/types';
import type { PipelineDefinition } from '../../types';
import {
    getPipelineChannelReferences,
    PipelineExecutionPermissionService,
} from './pipeline-execution-permission.service';

const loaderDefinition: AdapterDefinition = {
    type: AdapterType.LOADER,
    code: 'catalog-loader',
    schema: { fields: [] },
    requires: ['UpdateCatalog'],
};

function createDefinition(context?: PipelineDefinition['context']): PipelineDefinition {
    return {
        version: 1,
        context,
        steps: [{
            key: 'load-catalog',
            type: StepType.LOAD,
            config: { adapterCode: 'catalog-loader' },
        }],
    };
}

function createContext(...granted: string[]): RequestContext {
    const permissions = new Set(granted);
    return {
        channelId: 'channel-a',
        userHasPermissions: (requested: Permission[]) => requested.every(
            permission => permissions.has(permission),
        ),
    } as RequestContext;
}

function createService(options?: {
    deniedChannelIds?: string[];
    targetChannelId?: string;
}) {
    const registry = {
        find: vi.fn((type: string, code: string) => (
            type === AdapterType.LOADER && code === loaderDefinition.code
                ? loaderDefinition
                : undefined
        )),
    };
    const channelService = {
        getChannelFromToken: vi.fn(async () => ({
            id: options?.targetChannelId ?? 'channel-b',
        })),
        findOne: vi.fn(async (_ctx, id) => ({ id })),
        findAll: vi.fn(async (_ctx, options) => ({
            items: options?.filter?.code?.eq === 'missing-code'
                ? []
                : [{ id: options?.filter?.code?.eq ?? 'channel-b' }],
            totalItems: 1,
        })),
    };
    const roleService = {
        userHasAllPermissionsOnChannel: vi.fn(async (_ctx, channelId) => (
            !(options?.deniedChannelIds ?? []).includes(String(channelId))
        )),
    };
    const service = new PipelineExecutionPermissionService(
        registry as never,
        channelService as never,
        roleService as never,
    );
    return { service, channelService, roleService };
}

describe('pipeline execution target permissions', () => {
    it('collects the pipeline token and effective explicit step channels', () => {
        const definition = createDefinition({
            channel: 'target-token',
            channelStrategy: 'MULTI',
            channelIds: ['pipeline-channel'],
        });
        definition.steps.push({
            key: 'step-target',
            type: StepType.LOAD,
            config: { adapterCode: 'catalog-loader' },
            context: {
                channelStrategy: 'EXPLICIT',
                channelIds: ['step-channel'],
            },
        }, {
            key: 'inherited-active',
            type: StepType.LOAD,
            config: { adapterCode: 'catalog-loader' },
            context: {
                channelStrategy: 'INHERIT',
                channelIds: ['ignored-channel'],
            },
        });

        expect(getPipelineChannelReferences(definition)).toEqual({
            channelIds: ['pipeline-channel', 'step-channel'],
            channelTokens: ['target-token'],
            channelCodes: [],
            hasDynamicChannelAssignment: false,
        });
    });

    it('collects static loader channels and detects dynamic assignment', () => {
        const definition = createDefinition();
        definition.steps[0].config = {
            adapterCode: 'catalog-loader',
            channel: 'static-target-code',
            channelsField: 'channels',
        };

        expect(getPipelineChannelReferences(definition)).toEqual({
            channelIds: [],
            channelTokens: [],
            channelCodes: ['static-target-code'],
            hasDynamicChannelAssignment: true,
        });
    });

    it('rejects a cross-channel target before execution when its role is missing', async () => {
        const { service, roleService } = createService({
            deniedChannelIds: ['channel-b'],
        });
        const definition = createDefinition({
            channelStrategy: 'EXPLICIT',
            channelIds: ['channel-b'],
        });

        await expect(service.assertAllowed(
            createContext('UpdateCatalog'),
            definition,
        )).rejects.toBeInstanceOf(ForbiddenError);
        expect(roleService.userHasAllPermissionsOnChannel).toHaveBeenCalledWith(
            expect.anything(),
            'channel-b',
            ['RunDataHubPipeline', 'UpdateCatalog'],
        );
        expect(roleService.userHasAllPermissionsOnChannel).toHaveBeenCalledWith(
            expect.anything(),
            'channel-a',
            ['RunDataHubPipeline', 'UpdateCatalog'],
        );
    });

    it('resolves pipeline channel tokens and permits authorized targets', async () => {
        const { service, channelService, roleService } = createService();

        await expect(service.assertAllowed(
            createContext('UpdateCatalog'),
            createDefinition({ channel: 'target-token' }),
        )).resolves.toBeUndefined();
        expect(channelService.getChannelFromToken).toHaveBeenCalledWith(
            expect.anything(),
            'target-token',
        );
        expect(roleService.userHasAllPermissionsOnChannel).toHaveBeenCalledOnce();
    });

    it('resolves static loader channels by code', async () => {
        const { service, channelService } = createService();
        const definition = createDefinition();
        definition.steps[0].config.channel = '__default_channel__';

        await expect(service.assertAllowed(
            createContext('SuperAdmin'),
            definition,
        )).resolves.toBeUndefined();
        expect(channelService.findAll).toHaveBeenCalledWith(
            expect.anything(),
            {
                filter: { code: { eq: '__default_channel__' } },
                take: 1,
            },
        );
        expect(channelService.getChannelFromToken).not.toHaveBeenCalled();
    });

    it('rejects an unknown static loader channel code', async () => {
        const { service } = createService();
        const definition = createDefinition();
        definition.steps[0].config.channel = 'missing-code';

        await expect(service.assertAllowed(
            createContext('SuperAdmin'),
            definition,
        )).rejects.toThrow(
            'Configured loader channel code was not found: missing-code',
        );
    });

    it('fails active-channel capability checks before resolving targets', async () => {
        const { service, channelService, roleService } = createService();

        await expect(service.assertAllowed(
            createContext(),
            createDefinition({ channel: 'target-token' }),
        )).rejects.toBeInstanceOf(ForbiddenError);
        expect(channelService.getChannelFromToken).not.toHaveBeenCalled();
        expect(roleService.userHasAllPermissionsOnChannel).not.toHaveBeenCalled();
    });

    it('allows super administrators without per-channel role lookups', async () => {
        const { service, channelService, roleService } = createService();

        await expect(service.assertAllowed(
            createContext('SuperAdmin'),
            createDefinition({ channel: 'target-token' }),
        )).resolves.toBeUndefined();
        expect(channelService.getChannelFromToken).toHaveBeenCalledOnce();
        expect(roleService.userHasAllPermissionsOnChannel).not.toHaveBeenCalled();
    });

    it('rejects dynamic per-record channel assignment for delegated users', async () => {
        const { service, channelService, roleService } = createService();
        const definition = createDefinition();
        definition.steps[0].config = {
            adapterCode: 'catalog-loader',
            channelsField: 'channels',
        };

        await expect(service.assertAllowed(
            createContext('UpdateCatalog'),
            definition,
        )).rejects.toBeInstanceOf(ForbiddenError);
        expect(channelService.findOne).not.toHaveBeenCalled();
        expect(roleService.userHasAllPermissionsOnChannel).not.toHaveBeenCalled();
    });
});
