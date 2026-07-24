import { describe, expect, it, vi } from 'vitest';
import type { PipelineDefinition } from '../../types';
import { AdapterType, RunStatus, StepType } from '../../constants/enums';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { AdapterUpgradeGuardService } from './adapter-upgrade-guard.service';

const boundDefinition: PipelineDefinition = {
    version: 1,
    steps: [{
        key: 'extract',
        type: StepType.EXTRACT,
        config: { adapterCode: 'source' },
    }],
    adapterBindings: [{
        location: 'steps.extract',
        type: AdapterType.EXTRACTOR,
        code: 'source',
        version: '1.0.0',
        apiVersion: 1,
    }],
};

function createFixture(
    runs: Array<{
        id: string;
        status: RunStatus;
        definitionSnapshot: PipelineDefinition | null;
    }>,
    installedVersion = '1.0.0',
) {
    const find = vi.fn().mockResolvedValue(runs);
    const registry = new DataHubRegistryService();
    registry.register({
        type: AdapterType.EXTRACTOR,
        code: 'source',
        version: installedVersion,
        apiVersion: 1,
        schema: { fields: [] },
    });
    const service = new AdapterUpgradeGuardService({
        rawConnection: {
            getRepository: vi.fn(() => ({ find })),
        },
    } as never, registry);
    return { service, find };
}

describe('AdapterUpgradeGuardService', () => {
    it('accepts nonterminal runs pinned to the installed exact adapter contract', async () => {
        const { service, find } = createFixture([{
            id: '41',
            status: RunStatus.RUNNING,
            definitionSnapshot: boundDefinition,
        }]);

        await expect(service.assertNonterminalRunsCompatible()).resolves.toBeUndefined();
        expect(find).toHaveBeenCalledWith(expect.objectContaining({
            take: 1001,
            where: expect.objectContaining({
                status: expect.anything(),
            }),
        }));
    });

    it('blocks startup when an installed adapter version differs from a pinned run', async () => {
        const { service } = createFixture([{
            id: '42',
            status: RunStatus.PAUSED,
            definitionSnapshot: boundDefinition,
        }], '2.0.0');

        await expect(service.assertNonterminalRunsCompatible()).rejects.toThrow(
            /Adapter upgrade blocked.*run 42.*requires version 1\.0\.0.*installed version is 2\.0\.0.*Finish or cancel/s,
        );
    });

    it('fails closed when a nonterminal run has no definition snapshot', async () => {
        const { service } = createFixture([{
            id: '43',
            status: RunStatus.CANCEL_REQUESTED,
            definitionSnapshot: null,
        }]);

        await expect(service.assertNonterminalRunsCompatible()).rejects.toThrow(
            /run 43: Definition snapshot is unavailable/,
        );
    });
});
