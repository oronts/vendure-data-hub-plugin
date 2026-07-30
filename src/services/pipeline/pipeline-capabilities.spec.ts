import { describe, expect, it, vi } from 'vitest';
import type { Permission } from '@vendure/core';
import { AdapterType, StepType } from '../../constants/enums';
import type { AdapterDefinition } from '../../sdk/types';
import type { PipelineDefinition } from '../../types';
import {
    AdapterDefinitionRegistry,
    getEffectivePipelineCapabilities,
    getMissingPipelinePermissions,
    getRequiredPipelinePermissions,
    PermissionContext,
    withEffectivePipelineCapabilities,
} from './pipeline-capabilities';

const definitions = new Map<string, AdapterDefinition>([
    [`${AdapterType.LOADER}:productUpsert`, {
        type: AdapterType.LOADER,
        code: 'productUpsert',
        schema: { fields: [] },
        requires: ['UpdateCatalog'],
    }],
    [`${AdapterType.LOADER}:entityDeletion`, {
        type: AdapterType.LOADER,
        code: 'entityDeletion',
        schema: { fields: [] },
        requires: ['UpdateCatalog'],
    }],
    [`${AdapterType.OPERATOR}:translate`, {
        type: AdapterType.OPERATOR,
        code: 'translate',
        schema: { fields: [] },
        requires: ['UpdateSettings'],
    }],
]);

const registry: AdapterDefinitionRegistry = {
    find: (type, code) => definitions.get(`${type}:${code}`),
};

const loaderDefinition: PipelineDefinition = {
    version: 1,
    capabilities: {
        requires: ['RunDataHubPipeline'],
    },
    steps: [{
        key: 'load-products',
        type: StepType.LOAD,
        config: {
            adapterCode: 'productUpsert',
        },
    }],
};

describe('pipeline capabilities', () => {
    it('combines declared and adapter-required permissions', () => {
        expect(getRequiredPipelinePermissions(registry, loaderDefinition)).toEqual([
            'RunDataHubPipeline',
            'UpdateCatalog',
        ]);
    });

    it('includes nested transform operator permissions', () => {
        const definition: PipelineDefinition = {
            version: 1,
            steps: [{
                key: 'translate',
                type: StepType.TRANSFORM,
                config: { operators: [{ op: 'translate' }] },
            }],
        };

        expect(getRequiredPipelinePermissions(registry, definition)).toEqual(['UpdateSettings']);
    });

    it('derives permissions for direct and connection-backed secret resolution', () => {
        const definition: PipelineDefinition = {
            version: 1,
            steps: [{
                key: 'remote-source',
                type: StepType.EXTRACT,
                config: {
                    adapterCode: 'httpApi',
                    connectionCode: 'erp',
                    auth: { type: 'BEARER', secretCode: 'override-token' },
                },
            }],
        };

        expect(getRequiredPipelinePermissions(registry, definition)).toEqual([
            'UseDataHubConnection',
            'UseDataHubSecret',
        ]);
    });

    it('requires secret-use permission for connection references with indirect credentials', () => {
        const definition: PipelineDefinition = {
            version: 1,
            steps: [{
                key: 'remote-source',
                type: StepType.EXTRACT,
                config: { adapterCode: 'httpApi', connectionCode: 'erp' },
            }],
        };
        const ctx: PermissionContext = {
            userHasPermissions: permissions => permissions.includes(
                'UseDataHubConnection' as Permission,
            ),
        };

        expect(getMissingPipelinePermissions(registry, ctx, definition))
            .toEqual(['UseDataHubSecret']);
    });

    it('writes effective permissions without mutating the definition', () => {
        const result = withEffectivePipelineCapabilities(registry, loaderDefinition);

        expect(result).not.toBe(loaderDefinition);
        expect(result.capabilities?.requires).toEqual([
            'RunDataHubPipeline',
            'UpdateCatalog',
        ]);
        expect(loaderDefinition.capabilities?.requires).toEqual(['RunDataHubPipeline']);
    });

    it('returns a stable effective capability summary', () => {
        const definition: PipelineDefinition = {
            ...loaderDefinition,
            capabilities: {
                ...loaderDefinition.capabilities,
                writes: ['ORDERS', 'CATALOG', 'ORDERS'],
            },
        };

        expect(getEffectivePipelineCapabilities(registry, definition)).toEqual({
            requires: ['RunDataHubPipeline', 'UpdateCatalog'],
            writes: ['CATALOG', 'ORDERS'],
        });
    });

    it('uses configured deletion permissions and write domains', () => {
        const definition: PipelineDefinition = {
            version: 1,
            steps: [{
                key: 'delete-customers',
                type: StepType.LOAD,
                config: {
                    adapterCode: 'entityDeletion',
                    entityType: 'customer',
                },
            }],
        };

        expect(getEffectivePipelineCapabilities(registry, definition)).toEqual({
            requires: ['UpdateCustomer'],
            writes: ['CUSTOMERS'],
        });
    });

    it('requires every permission on the active channel', () => {
        const userHasPermissions = vi.fn((permissions: Permission[]) => (
            permissions.includes('RunDataHubPipeline' as Permission)
        ));
        const ctx: PermissionContext = { userHasPermissions };

        expect(getMissingPipelinePermissions(registry, ctx, loaderDefinition))
            .toEqual(['UpdateCatalog']);
    });

    it('allows super administrators', () => {
        const ctx: PermissionContext = {
            userHasPermissions: permissions => permissions.includes('SuperAdmin' as Permission),
        };

        expect(getMissingPipelinePermissions(registry, ctx, loaderDefinition)).toEqual([]);
    });
});
