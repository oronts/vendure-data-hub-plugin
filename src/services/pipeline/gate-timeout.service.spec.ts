import { afterEach, describe, expect, it, vi } from 'vitest';
import { GATE_TIMEOUT_MAINTENANCE } from '../../constants';
import { GateTimeoutService } from './gate-timeout.service';

interface GateTimeoutInternals {
    runMaintenanceCycle(): Promise<void>;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(resolvePromise => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

interface Candidate {
    id: string;
    gateStepKey: string | null;
    gateTimeoutAt: Date | string | null;
}

interface FixtureOptions {
    candidates?: Candidate[];
    claimAffected?: number;
    isServer?: boolean;
    approvalError?: Error;
    eventError?: Error;
}

function createFixture(options: FixtureOptions = {}) {
    const candidates = options.candidates ?? [{
        id: 'run-1',
        gateStepKey: 'approval',
        gateTimeoutAt: '2026-07-22T09:59:00.000Z',
    }];
    const selectBuilder = {
        select: vi.fn(),
        addSelect: vi.fn(),
        where: vi.fn(),
        andWhere: vi.fn(),
        orderBy: vi.fn(),
        addOrderBy: vi.fn(),
        take: vi.fn(),
        getRawMany: vi.fn(async () => candidates),
    };
    for (const method of [
        selectBuilder.select,
        selectBuilder.addSelect,
        selectBuilder.where,
        selectBuilder.andWhere,
        selectBuilder.orderBy,
        selectBuilder.addOrderBy,
        selectBuilder.take,
    ]) {
        method.mockReturnValue(selectBuilder);
    }

    const updateBuilder = {
        update: vi.fn(),
        set: vi.fn(),
        where: vi.fn(),
        andWhere: vi.fn(),
        execute: vi.fn(async () => ({ affected: options.claimAffected ?? 1 })),
    };
    for (const method of [
        updateBuilder.update,
        updateBuilder.set,
        updateBuilder.where,
        updateBuilder.andWhere,
    ]) {
        method.mockReturnValue(updateBuilder);
    }

    const repository = {
        createQueryBuilder: vi.fn((alias?: string) => (
            alias ? selectBuilder : updateBuilder
        )),
    };
    const approveGate = options.approvalError
        ? vi.fn(async () => Promise.reject(options.approvalError))
        : vi.fn(async () => ({ pipelineId: 'pipeline-1' }));
    const pipelineService = { approveGate };
    const moduleRef = { get: vi.fn(() => pipelineService) };
    const publishGateTimeout = options.eventError
        ? vi.fn(() => { throw options.eventError; })
        : vi.fn();
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    const service = new GateTimeoutService(
        moduleRef as never,
        { getRepository: vi.fn(() => repository) } as never,
        { isServer: options.isServer ?? true } as never,
        { publishGateTimeout } as never,
        { createLogger: vi.fn(() => logger) } as never,
    );

    return {
        approveGate,
        logger,
        moduleRef,
        publishGateTimeout,
        selectBuilder,
        service,
        updateBuilder,
    };
}

describe('GateTimeoutService', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('waits for active timeout maintenance during shutdown', async () => {
        const fixture = createFixture();
        const pendingCandidates = deferred<Candidate[]>();
        fixture.selectBuilder.getRawMany.mockReturnValueOnce(pendingCandidates.promise);

        const maintenance = (fixture.service as unknown as GateTimeoutInternals)
            .runMaintenanceCycle();
        await vi.waitFor(() => {
            expect(fixture.selectBuilder.getRawMany).toHaveBeenCalledOnce();
        });
        let stopped = false;
        const shutdown = fixture.service.onModuleDestroy().then(() => {
            stopped = true;
        });
        await Promise.resolve();
        expect(stopped).toBe(false);
        pendingCandidates.resolve([]);
        await Promise.all([maintenance, shutdown]);

        expect(stopped).toBe(true);
        expect(fixture.approveGate).not.toHaveBeenCalled();
    });

    it('does not run timeout maintenance in a worker process', async () => {
        const fixture = createFixture({ isServer: false });

        await fixture.service.onModuleInit();

        expect(fixture.moduleRef.get).not.toHaveBeenCalled();
        expect(fixture.approveGate).not.toHaveBeenCalled();
    });

    it('claims and approves due gates from a bounded ordered query', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-22T10:00:00.000Z'));
        const fixture = createFixture();

        await fixture.service.onModuleInit();
        fixture.service.onModuleDestroy();

        expect(fixture.selectBuilder.take).toHaveBeenCalledWith(
            GATE_TIMEOUT_MAINTENANCE.BATCH_SIZE,
        );
        expect(fixture.selectBuilder.orderBy).toHaveBeenCalledWith(
            'pipelineRun.gateTimeoutAt',
            'ASC',
        );
        expect(fixture.updateBuilder.set).toHaveBeenCalledWith({
            gateTimeoutLeaseToken: expect.any(String),
            gateTimeoutLeaseExpiresAt: new Date(
                Date.now() + GATE_TIMEOUT_MAINTENANCE.LEASE_TTL_MS,
            ),
        });
        expect(fixture.approveGate).toHaveBeenCalledWith(
            expect.anything(),
            'run-1',
            'approval',
        );
        expect(fixture.publishGateTimeout).toHaveBeenCalledWith(
            'pipeline-1',
            'run-1',
            'approval',
        );
    });

    it('logs timezone-less database deadlines as UTC', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-22T10:00:00.000Z'));
        const fixture = createFixture({
            candidates: [{
                id: 'run-1',
                gateStepKey: 'approval',
                gateTimeoutAt: '2026-07-22 09:59:00.000',
            }],
        });

        await fixture.service.onModuleInit();
        fixture.service.onModuleDestroy();

        expect(fixture.logger.info).toHaveBeenCalledWith(
            expect.stringContaining('timeout expired'),
            expect.objectContaining({
                expectedAt: '2026-07-22T09:59:00.000Z',
                delayMs: 60_000,
            }),
        );
    });

    it('does not approve a gate claimed by another process', async () => {
        vi.useFakeTimers();
        const fixture = createFixture({ claimAffected: 0 });

        await fixture.service.onModuleInit();
        fixture.service.onModuleDestroy();

        expect(fixture.approveGate).not.toHaveBeenCalled();
        expect(fixture.publishGateTimeout).not.toHaveBeenCalled();
    });

    it('publishes the timeout event only after durable approval', async () => {
        vi.useFakeTimers();
        const fixture = createFixture({ approvalError: new Error('approval failed') });

        await fixture.service.onModuleInit();
        fixture.service.onModuleDestroy();

        expect(fixture.updateBuilder.set).toHaveBeenCalledOnce();
        expect(fixture.publishGateTimeout).not.toHaveBeenCalled();
        expect(fixture.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('timeout auto-approval failed'),
            expect.objectContaining({
                error: 'approval failed',
                retryAfter: new Date(
                    Date.now() + GATE_TIMEOUT_MAINTENANCE.LEASE_TTL_MS,
                ).toISOString(),
            }),
        );
    });

    it('does not repeat approval when observer publication fails', async () => {
        vi.useFakeTimers();
        const fixture = createFixture({ eventError: new Error('observer failed') });

        await fixture.service.onModuleInit();
        fixture.service.onModuleDestroy();

        expect(fixture.approveGate).toHaveBeenCalledOnce();
        expect(fixture.logger.warn).toHaveBeenCalledWith(
            'Gate timeout event publication failed',
            expect.objectContaining({ error: 'observer failed' }),
        );
    });
});
