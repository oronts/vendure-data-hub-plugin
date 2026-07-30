import { describe, expect, it, vi } from 'vitest';
import { DataHubSandboxResolver } from './sandbox.resolver';

function createFixture() {
    const sandboxService = {
        executeWithDefinition: vi.fn(),
    };
    const revisionService = {
        getRevision: vi.fn(),
    };
    return {
        sandboxService,
        revisionService,
        resolver: new DataHubSandboxResolver(
            sandboxService as never,
            revisionService as never,
        ),
    };
}

describe('DataHubSandboxResolver revision scope', () => {
    it('rejects revisions that do not both belong to the requested pipeline', async () => {
        const fixture = createFixture();
        fixture.revisionService.getRevision
            .mockResolvedValueOnce({
                pipelineId: 'pipeline-a',
                definition: { version: 1, name: 'Before', steps: [] },
            })
            .mockResolvedValueOnce({
                pipelineId: 'pipeline-b',
                definition: { version: 1, name: 'After', steps: [] },
            });

        await expect(fixture.resolver.dataHubCompareSandboxResults(
            {} as never,
            {
                pipelineId: 'pipeline-a',
                fromRevisionId: 'revision-1',
                toRevisionId: 'revision-2',
            },
        )).rejects.toThrow('One or both revisions not found');
        expect(fixture.sandboxService.executeWithDefinition).not.toHaveBeenCalled();
    });
});
