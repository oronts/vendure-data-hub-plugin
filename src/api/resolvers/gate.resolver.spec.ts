import { describe, expect, it, vi } from 'vitest';
import { DataHubGateAdminResolver } from './gate.resolver';

function createFixture(action: 'approveGate' | 'rejectGate') {
    const failure = new Error(`${action} failed`);
    const transactionalContext = { transaction: true };
    const pipelineService = {
        approveGate: vi.fn(),
        rejectGate: vi.fn(),
    };
    pipelineService[action].mockRejectedValue(failure);
    let rolledBack = false;
    const connection = {
        withTransaction: vi.fn(async (_ctx, work: (ctx: unknown) => Promise<unknown>) => {
            try {
                return await work(transactionalContext);
            } catch (error) {
                rolledBack = true;
                throw error;
            }
        }),
    };
    return {
        resolver: new DataHubGateAdminResolver(pipelineService as never, connection as never),
        pipelineService,
        transactionalContext,
        wasRolledBack: () => rolledBack,
    };
}

describe('DataHubGateAdminResolver transaction boundary', () => {
    it.each([
        ['approveDataHubGate', 'approveGate'],
        ['rejectDataHubGate', 'rejectGate'],
    ] as const)('rolls back before %s translates the failure', async (resolverMethod, serviceMethod) => {
        const fixture = createFixture(serviceMethod);

        const result = await fixture.resolver[resolverMethod](
            {} as never,
            { runId: 'run-1', stepKey: 'gate-1' },
        );

        expect(result).toEqual({
            success: false,
            run: null,
            message: `${serviceMethod} failed`,
        });
        expect(fixture.wasRolledBack()).toBe(true);
        expect(fixture.pipelineService[serviceMethod]).toHaveBeenCalledWith(
            fixture.transactionalContext,
            'run-1',
            'gate-1',
        );
    });
});
