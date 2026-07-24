import { randomUUID } from 'node:crypto';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
    ID,
    ProcessContext,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import type { Repository } from 'typeorm';
import { GATE_TIMEOUT_MAINTENANCE, LOGGER_CONTEXTS } from '../../constants';
import { RunStatus } from '../../constants/enums';
import { PipelineRun } from '../../entities/pipeline';
import { getErrorMessage } from '../../utils/error.utils';
import { DomainEventsService } from '../events/domain-events.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { PipelineService } from './pipeline.service';

interface ExpiredGateRow {
    id: ID;
    gateStepKey: string | null;
    gateTimeoutAt: Date | string | null;
}

const DATABASE_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

@Injectable()
export class GateTimeoutService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private handle: ReturnType<typeof setInterval> | null = null;
    private checkInProgress = false;
    private pipelineService: PipelineService | null = null;

    constructor(
        private moduleRef: ModuleRef,
        private connection: TransactionalConnection,
        private processContext: ProcessContext,
        private domainEvents: DomainEventsService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.GATE_EXECUTOR);
    }

    async onModuleInit(): Promise<void> {
        if (!this.processContext.isServer) {
            this.logger.debug('Gate timeout maintenance disabled outside the server process');
            return;
        }

        this.handle = setInterval(() => {
            this.runMaintenanceCycle().catch(error => {
                this.logger.warn('Gate timeout maintenance failed', {
                    error: getErrorMessage(error),
                });
            });
        }, GATE_TIMEOUT_MAINTENANCE.CHECK_INTERVAL_MS);
        this.handle.unref();

        await this.runMaintenanceCycle().catch(error => {
            this.logger.warn('Initial gate timeout maintenance failed', {
                error: getErrorMessage(error),
            });
        });
    }

    onModuleDestroy(): void {
        if (this.handle) {
            clearInterval(this.handle);
            this.handle = null;
        }
    }

    private async runMaintenanceCycle(): Promise<void> {
        if (this.checkInProgress) {
            this.logger.debug('Skipping overlapping gate timeout maintenance');
            return;
        }

        const pipelineService = this.getPipelineService();
        if (!pipelineService) return;

        this.checkInProgress = true;
        try {
            await this.processExpiredGates(pipelineService);
        } finally {
            this.checkInProgress = false;
        }
    }

    private getPipelineService(): PipelineService | null {
        if (this.pipelineService) return this.pipelineService;
        try {
            this.pipelineService = this.moduleRef.get(PipelineService, { strict: false });
        } catch {
            this.logger.debug('PipelineService not available for gate timeout maintenance');
        }
        return this.pipelineService;
    }

    private async processExpiredGates(
        pipelineService: PipelineService,
    ): Promise<void> {
        const ctx = RequestContext.empty();
        const repository = this.connection.getRepository(ctx, PipelineRun);
        const now = new Date();
        const candidates = await this.findCandidates(repository, now);

        for (const candidate of candidates) {
            const stepKey = candidate.gateStepKey;
            if (!stepKey) {
                this.logger.warn('Skipping gate timeout without a step key', {
                    runId: String(candidate.id),
                });
                continue;
            }

            const leaseToken = randomUUID();
            const claimNow = new Date();
            const claimed = await this.claimCandidate(
                repository,
                candidate,
                stepKey,
                leaseToken,
                claimNow,
            );
            if (!claimed) continue;

            try {
                const approved = await pipelineService.approveGate(
                    ctx,
                    candidate.id,
                    stepKey,
                );
                const expectedAt = this.toDate(candidate.gateTimeoutAt);
                const approvedAt = new Date();
                this.logger.info(`GATE "${stepKey}": timeout expired, auto-approved run ${candidate.id}`, {
                    expectedAt: expectedAt?.toISOString(),
                    delayMs: expectedAt
                        ? Math.max(0, approvedAt.getTime() - expectedAt.getTime())
                        : undefined,
                });
                try {
                    this.domainEvents.publishGateTimeout(
                        approved.pipelineId?.toString(),
                        String(candidate.id),
                        stepKey,
                    );
                } catch (error) {
                    // Approval is durable; an observer failure must not re-run it.
                    this.logger.warn('Gate timeout event publication failed', {
                        runId: String(candidate.id),
                        stepKey,
                        error: getErrorMessage(error),
                    });
                }
            } catch (error) {
                this.logger.warn(`GATE "${stepKey}": timeout auto-approval failed for run ${candidate.id}`, {
                    error: getErrorMessage(error),
                    leaseToken,
                    retryAfter: new Date(
                        claimNow.getTime() + GATE_TIMEOUT_MAINTENANCE.LEASE_TTL_MS,
                    ).toISOString(),
                });
            }
        }
    }

    private findCandidates(
        repository: Repository<PipelineRun>,
        now: Date,
    ): Promise<ExpiredGateRow[]> {
        return repository
            .createQueryBuilder('pipelineRun')
            .select('pipelineRun.id', 'id')
            .addSelect('pipelineRun.gateStepKey', 'gateStepKey')
            .addSelect('pipelineRun.gateTimeoutAt', 'gateTimeoutAt')
            .where('pipelineRun.status = :status', { status: RunStatus.PAUSED })
            .andWhere('pipelineRun.gateStepKey IS NOT NULL')
            .andWhere("TRIM(pipelineRun.gateStepKey) <> ''")
            .andWhere('pipelineRun.gateTimeoutAt IS NOT NULL')
            .andWhere('pipelineRun.gateTimeoutAt <= :now', { now })
            .andWhere(
                '(pipelineRun.gateTimeoutLeaseExpiresAt IS NULL OR pipelineRun.gateTimeoutLeaseExpiresAt <= :now)',
                { now },
            )
            .orderBy('pipelineRun.gateTimeoutAt', 'ASC')
            .addOrderBy('pipelineRun.id', 'ASC')
            .take(GATE_TIMEOUT_MAINTENANCE.BATCH_SIZE)
            .getRawMany<ExpiredGateRow>();
    }

    private async claimCandidate(
        repository: Repository<PipelineRun>,
        candidate: ExpiredGateRow,
        stepKey: string,
        leaseToken: string,
        now: Date,
    ): Promise<boolean> {
        const leaseExpiresAt = new Date(
            now.getTime() + GATE_TIMEOUT_MAINTENANCE.LEASE_TTL_MS,
        );
        const result = await repository
            .createQueryBuilder()
            .update(PipelineRun)
            .set({
                gateTimeoutLeaseToken: leaseToken,
                gateTimeoutLeaseExpiresAt: leaseExpiresAt,
            })
            .where('id = :id', { id: candidate.id })
            .andWhere('status = :status', { status: RunStatus.PAUSED })
            .andWhere('gateStepKey = :stepKey', { stepKey })
            .andWhere('gateTimeoutAt IS NOT NULL AND gateTimeoutAt <= :now', { now })
            .andWhere(
                '(gateTimeoutLeaseExpiresAt IS NULL OR gateTimeoutLeaseExpiresAt <= :now)',
                { now },
            )
            .execute();
        return result.affected === 1;
    }

    private toDate(value: Date | string | null): Date | null {
        if (value instanceof Date) return value;
        if (typeof value !== 'string') return null;
        const normalized = DATABASE_DATETIME_PATTERN.test(value)
            ? `${value.replace(' ', 'T')}Z`
            : value;
        const date = new Date(normalized);
        return Number.isNaN(date.getTime()) ? null : date;
    }
}
