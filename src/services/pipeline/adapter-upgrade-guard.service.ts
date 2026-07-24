import { Injectable } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { SCHEDULER } from '../../constants';
import { RunStatus } from '../../constants/enums';
import { PipelineRun } from '../../entities/pipeline';
import {
    type AdapterBindingIssue,
    validateAdapterBindings,
} from '../../sdk/adapter-bindings';
import { DataHubRegistryService } from '../../sdk/registry.service';

const MAX_REPORTED_INCOMPATIBLE_RUNS = 20;

const NONTERMINAL_RUN_STATUSES = [
    RunStatus.PENDING,
    RunStatus.RUNNING,
    RunStatus.PAUSED,
    RunStatus.CANCEL_REQUESTED,
] as const;

interface IncompatibleRun {
    readonly id: string;
    readonly issues: readonly AdapterBindingIssue[];
}

@Injectable()
export class AdapterUpgradeGuardService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly registry: DataHubRegistryService,
    ) {}

    async assertNonterminalRunsCompatible(): Promise<void> {
        const runs = await this.connection.rawConnection
            .getRepository(PipelineRun)
            .find({
                where: { status: In([...NONTERMINAL_RUN_STATUSES]) },
                select: { id: true, definitionSnapshot: true },
                order: { id: 'ASC' },
                take: SCHEDULER.MAX_PIPELINE_DISCOVERY + 1,
            });

        if (runs.length > SCHEDULER.MAX_PIPELINE_DISCOVERY) {
            throw new Error(
                'Adapter upgrade preflight exceeded the safe nonterminal run '
                + `limit of ${SCHEDULER.MAX_PIPELINE_DISCOVERY}`,
            );
        }

        const incompatible = runs.flatMap(run => {
            if (!run.definitionSnapshot) {
                return [{
                    id: String(run.id),
                    issues: [{
                        message: 'Definition snapshot is unavailable',
                        errorCode: 'missing-definition-snapshot',
                    }],
                }];
            }

            const issues = validateAdapterBindings(
                this.registry,
                run.definitionSnapshot,
                true,
            );
            return issues.length > 0
                ? [{ id: String(run.id), issues }]
                : [];
        });

        if (incompatible.length > 0) {
            throw new Error(this.formatUpgradeBlock(incompatible));
        }
    }

    private formatUpgradeBlock(runs: readonly IncompatibleRun[]): string {
        const reported = runs.slice(0, MAX_REPORTED_INCOMPATIBLE_RUNS)
            .map(run => {
                const issues = run.issues
                    .map(issue => issue.message)
                    .join('; ');
                return `run ${run.id}: ${issues}`;
            })
            .join(' | ');
        const omitted = runs.length - MAX_REPORTED_INCOMPATIBLE_RUNS;
        const suffix = omitted > 0
            ? ` | ${omitted} additional incompatible runs omitted`
            : '';

        return 'Adapter upgrade blocked by nonterminal pipeline runs with pinned '
            + `adapter contracts: ${reported}${suffix}. Finish or cancel these runs `
            + 'using the previously installed adapter versions before deploying '
            + 'the upgrade.';
    }
}
