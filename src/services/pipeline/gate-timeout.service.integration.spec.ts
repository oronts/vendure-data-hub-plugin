import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource, EntitySchema, Repository } from 'typeorm';
import { GATE_TIMEOUT_MAINTENANCE } from '../../constants';
import { RunStatus } from '../../constants/enums';
import { TABLE_NAMES } from '../../constants/table-names';
import { PipelineRun } from '../../entities/pipeline';
import { GateTimeoutService } from './gate-timeout.service';

interface ClaimCandidate {
    id: number;
    gateStepKey: string;
    gateTimeoutAt: Date;
}

interface ClaimAccess {
    claimCandidate(
        repository: Repository<PipelineRun>,
        candidate: ClaimCandidate,
        stepKey: string,
        leaseToken: string,
        now: Date,
    ): Promise<boolean>;
}

describe('GateTimeoutService database integration', () => {
    let directory: string;
    let databasePath: string;
    let primary: DataSource;
    let secondary: DataSource;
    const pipelineId = 1;
    const services: GateTimeoutService[] = [];

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'data-hub-gate-timeout-'));
        databasePath = join(directory, 'gate-timeout.sqlite');
        primary = createDataSource(databasePath, true);
        secondary = createDataSource(databasePath, false);
        await primary.initialize();
        await secondary.initialize();
        await primary.query('PRAGMA busy_timeout = 5000');
        await secondary.query('PRAGMA busy_timeout = 5000');

    });

    afterEach(async () => {
        for (const service of services) service.onModuleDestroy();
        if (secondary?.isInitialized) await secondary.destroy();
        if (primary?.isInitialized) await primary.destroy();
        if (directory) await rm(directory, { recursive: true, force: true });
    });

    it('allows only one connection to claim the same expired gate', async () => {
        const dueAt = new Date(Date.now() - 60_000);
        const run = await createPausedRun(primary, dueAt);
        const first = createService(primary);
        const second = createService(secondary);
        const candidate: ClaimCandidate = {
            id: Number(run.id),
            gateStepKey: 'approval',
            gateTimeoutAt: dueAt,
        };
        const now = new Date();

        const claims = await Promise.all([
            (first.service as unknown as ClaimAccess).claimCandidate(
                primary.getRepository(PipelineRun),
                candidate,
                candidate.gateStepKey,
                'first-lease',
                now,
            ),
            (second.service as unknown as ClaimAccess).claimCandidate(
                secondary.getRepository(PipelineRun),
                candidate,
                candidate.gateStepKey,
                'second-lease',
                now,
            ),
        ]);

        expect(claims.filter(Boolean)).toHaveLength(1);
        const persisted = await primary.getRepository(PipelineRun).findOneByOrFail({
            id: run.id,
        });
        expect(['first-lease', 'second-lease']).toContain(
            persisted.gateTimeoutLeaseToken,
        );
    });

    it('recovers an expired lease and leaves an active lease untouched', async () => {
        const now = Date.now();
        const expired = await createPausedRun(
            primary,
            new Date(now - 120_000),
            new Date(now - 1_000),
        );
        const active = await createPausedRun(
            primary,
            new Date(now - 120_000),
            new Date(now + 120_000),
        );
        const fixture = createService(primary);

        await fixture.service.onModuleInit();

        expect(fixture.approveGate).toHaveBeenCalledOnce();
        expect(fixture.approveGate).toHaveBeenCalledWith(
            expect.anything(),
            expired.id,
            'approval',
        );
        const activeAfter = await primary
            .getRepository(PipelineRun)
            .findOneByOrFail({ id: active.id });
        expect(activeAfter.gateTimeoutLeaseToken).toBe('existing-lease');
        expect(activeAfter.gateTimeoutLeaseExpiresAt?.getTime()).toBeGreaterThan(now);
    });

    it('starts each row lease when that row is claimed', async () => {
        const now = Date.now();
        const firstRun = await createPausedRun(
            primary,
            new Date(now - 120_000),
        );
        const secondRun = await createPausedRun(
            primary,
            new Date(now - 60_000),
        );
        let approvalCount = 0;
        const approveGate = vi.fn(async () => {
            approvalCount += 1;
            if (approvalCount === 1) {
                await new Promise(resolve => setTimeout(resolve, 25));
            }
            return { pipelineId };
        });
        const fixture = createService(primary, approveGate);

        await fixture.service.onModuleInit();

        expect(approveGate).toHaveBeenCalledTimes(2);
        const [firstAfter, secondAfter] = await Promise.all([
            primary.getRepository(PipelineRun).findOneByOrFail({ id: firstRun.id }),
            primary.getRepository(PipelineRun).findOneByOrFail({ id: secondRun.id }),
        ]);
        expect(firstAfter.gateTimeoutLeaseExpiresAt).toBeInstanceOf(Date);
        expect(secondAfter.gateTimeoutLeaseExpiresAt).toBeInstanceOf(Date);
        expect(
            secondAfter.gateTimeoutLeaseExpiresAt!.getTime()
            - firstAfter.gateTimeoutLeaseExpiresAt!.getTime(),
        ).toBeGreaterThanOrEqual(15);
        expect(
            firstAfter.gateTimeoutLeaseExpiresAt!.getTime() - now,
        ).toBeLessThanOrEqual(GATE_TIMEOUT_MAINTENANCE.LEASE_TTL_MS + 1_000);
    });

    function createService(
        source: DataSource,
        approveGate = vi.fn(async () => ({ pipelineId })),
    ) {
        const pipelineService = { approveGate };
        const service = new GateTimeoutService(
            { get: vi.fn(() => pipelineService) } as never,
            {
                getRepository: vi.fn(() => source.getRepository(PipelineRun)),
            } as never,
            { isServer: true } as never,
            { publishGateTimeout: vi.fn() } as never,
            {
                createLogger: vi.fn(() => ({
                    debug: vi.fn(),
                    info: vi.fn(),
                    warn: vi.fn(),
                    error: vi.fn(),
                })),
            } as never,
        );
        services.push(service);
        return { approveGate, service };
    }

    async function createPausedRun(
        source: DataSource,
        gateTimeoutAt: Date,
        leaseExpiresAt: Date | null = null,
    ): Promise<PipelineRun> {
        const repository = source.getRepository(PipelineRun);
        return repository.save(repository.create({
            pipelineId,
            status: RunStatus.PAUSED,
            gateStepKey: 'approval',
            gateTimeoutAt,
            gateTimeoutLeaseToken: leaseExpiresAt ? 'existing-lease' : null,
            gateTimeoutLeaseExpiresAt: leaseExpiresAt,
        }));
    }
});

function createDataSource(database: string, synchronize: boolean): DataSource {
    return new DataSource({
        type: 'better-sqlite3',
        database,
        entities: [PIPELINE_RUN_SCHEMA],
        synchronize,
        logging: false,
    });
}

const PIPELINE_RUN_SCHEMA = new EntitySchema<PipelineRun>({
    name: 'PipelineRun',
    target: PipelineRun,
    tableName: TABLE_NAMES.PIPELINE_RUN,
    columns: {
        id: {
            type: Number,
            primary: true,
            generated: 'increment',
        },
        createdAt: {
            type: 'datetime',
            createDate: true,
        },
        updatedAt: {
            type: 'datetime',
            updateDate: true,
        },
        pipelineId: {
            type: Number,
        },
        status: {
            type: String,
            length: 20,
        },
        gateStepKey: {
            type: String,
            length: 255,
            nullable: true,
        },
        gateTimeoutAt: {
            type: 'datetime',
            nullable: true,
        },
        gateTimeoutLeaseToken: {
            type: String,
            length: 64,
            nullable: true,
        },
        gateTimeoutLeaseExpiresAt: {
            type: 'datetime',
            nullable: true,
        },
    },
    indices: [
        { columns: ['status', 'gateTimeoutAt'] },
        { columns: ['status', 'gateTimeoutLeaseExpiresAt'] },
    ],
});
