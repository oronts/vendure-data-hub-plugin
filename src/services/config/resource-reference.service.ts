import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import {
    DataHubConnection,
    DataHubExportDestination,
    DataHubSecret,
} from '../../entities/config';
import type { PipelineDefinition } from '../../types';
import { RunStatus } from '../../constants/enums';
import { SCHEDULER } from '../../constants';
import { PipelineRun } from '../../entities/pipeline';
import {
    loadActivePipelineDefinitions,
    loadActivePipelineDefinitionsAcrossChannels,
} from '../pipeline/active-pipeline-definitions';
import { SecretService } from './secret.service';
import { collectResourceReferences } from './resource-references';

export { collectResourceReferences } from './resource-references';

export interface SecretReferenceUsage {
    readonly publishedPipelines: readonly string[];
    readonly nonterminalRuns: readonly string[];
    readonly connections: readonly string[];
    readonly destinations: readonly string[];
}

export interface MissingResourceReferences {
    readonly connections: readonly string[];
    readonly secrets: readonly string[];
}

export class ResourceInUseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ResourceInUseError';
    }
}

interface NonterminalRunDefinition {
    readonly id: string;
    readonly definition: PipelineDefinition;
}

const NONTERMINAL_RUN_STATUSES = [
    RunStatus.PENDING,
    RunStatus.RUNNING,
    RunStatus.PAUSED,
    RunStatus.CANCEL_REQUESTED,
] as const;

@Injectable()
export class ResourceReferenceService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly secretService: SecretService,
    ) {}

    async findMissingDefinitionReferences(
        ctx: RequestContext | undefined,
        definition: PipelineDefinition,
    ): Promise<MissingResourceReferences> {
        const references = collectResourceReferences(definition);
        const connectionCodes = [...references.connections];
        const connectionRepository = ctx
            ? this.connection.getRepository(ctx, DataHubConnection)
            : this.connection.rawConnection.getRepository(DataHubConnection);
        const connections = connectionCodes.length === 0
            ? []
            : await connectionRepository.find({
                where: {
                    code: In(connectionCodes),
                    ...(ctx ? { channels: { id: ctx.channelId } } : {}),
                },
                select: { code: true, config: true },
            });
        const foundConnectionCodes = new Set(connections.map(item => item.code));
        const secretCodes = new Set(references.secrets);
        for (const connection of connections) {
            for (const secretCode of collectResourceReferences(connection.config).secrets) {
                secretCodes.add(secretCode);
            }
        }

        if (ctx) {
            const foundSecrets = await Promise.all(
                [...secretCodes].map(async code => ({
                    code,
                    found: await this.secretService.exists(ctx, code),
                })),
            );
            return {
                connections: connectionCodes
                    .filter(code => !foundConnectionCodes.has(code))
                    .sort(),
                secrets: foundSecrets
                    .filter(item => !item.found)
                    .map(item => item.code)
                    .sort(),
            };
        }

        const databaseSecretCodes = [...secretCodes]
            .filter(code => !this.secretService.isConfigSecret(code));
        const secretRepository = ctx
            ? this.connection.getRepository(ctx, DataHubSecret)
            : this.connection.rawConnection.getRepository(DataHubSecret);
        const databaseSecrets = databaseSecretCodes.length === 0
            ? []
            : await secretRepository.find({
                where: { code: In(databaseSecretCodes) },
                select: { code: true },
            });
        const foundSecretCodes = new Set(databaseSecrets.map(item => item.code));

        return {
            connections: connectionCodes
                .filter(code => !foundConnectionCodes.has(code))
                .sort(),
            secrets: databaseSecretCodes
                .filter(code => !foundSecretCodes.has(code))
                .sort(),
        };
    }

    async assertConnectionMutable(
        ctx: RequestContext,
        code: string,
    ): Promise<void> {
        const [definitions, runs] = await Promise.all([
            loadActivePipelineDefinitionsAcrossChannels(this.connection, ctx),
            this.loadNonterminalRunDefinitions(ctx),
        ]);
        const publishedPipelines = definitions
            .filter(item => collectResourceReferences(item.definition).connections.has(code))
            .map(item => item.code)
            .sort();
        const nonterminalRuns = runs
            .filter(item => collectResourceReferences(item.definition).connections.has(code))
            .map(item => item.id)
            .sort();

        if (publishedPipelines.length > 0 || nonterminalRuns.length > 0) {
            const references = [
                this.formatUsage('published pipelines', publishedPipelines),
                this.formatUsage('nonterminal pipeline runs', nonterminalRuns),
            ].filter((item): item is string => item !== null);
            throw new ResourceInUseError(
                `Connection "${code}" is referenced by ${references.join('; ')}. `
                + 'Update and republish those pipelines, and wait for or cancel those runs, '
                + 'before changing its code or type, or deleting it.',
            );
        }
    }

    async assertConnectionUnassignable(
        ctx: RequestContext,
        code: string,
    ): Promise<void> {
        const [definitions, runs] = await Promise.all([
            loadActivePipelineDefinitions(this.connection, ctx),
            this.loadNonterminalRunDefinitions(ctx, ctx.channelId),
        ]);
        const publishedPipelines = definitions
            .filter(item => collectResourceReferences(item.definition).connections.has(code))
            .map(item => item.code)
            .sort();
        const nonterminalRuns = runs
            .filter(item => collectResourceReferences(item.definition).connections.has(code))
            .map(item => item.id)
            .sort();
        if (publishedPipelines.length > 0 || nonterminalRuns.length > 0) {
            throw new ResourceInUseError(
                `Connection "${code}" is still used in the active channel`,
            );
        }
    }

    async assertSecretMutable(
        ctx: RequestContext,
        code: string,
    ): Promise<void> {
        const usage = await this.findSecretUsage(ctx, code);
        const references = [
            this.formatUsage('published pipelines', usage.publishedPipelines),
            this.formatUsage('nonterminal pipeline runs', usage.nonterminalRuns),
            this.formatUsage('connections', usage.connections),
            this.formatUsage('destinations', usage.destinations),
        ].filter((item): item is string => item !== null);

        if (references.length > 0) {
            throw new ResourceInUseError(
                `Secret "${code}" is referenced by ${references.join('; ')}. `
                + 'Remove or replace those references before renaming or deleting the secret.',
            );
        }
    }

    async findSecretUsage(
        ctx: RequestContext,
        code: string,
        acrossChannels = true,
    ): Promise<SecretReferenceUsage> {
        const [definitions, runs, connections, destinations] = await Promise.all([
            acrossChannels
                ? loadActivePipelineDefinitionsAcrossChannels(this.connection, ctx)
                : loadActivePipelineDefinitions(this.connection, ctx),
            this.loadNonterminalRunDefinitions(
                ctx,
                acrossChannels ? undefined : ctx.channelId,
            ),
            this.connection.getRepository(ctx, DataHubConnection).find({
                where: acrossChannels ? {} : { channels: { id: ctx.channelId } },
                select: { code: true, config: true },
            }),
            this.connection.getRepository(ctx, DataHubExportDestination).find({
                select: { destinationId: true, config: true },
            }),
        ]);

        return {
            publishedPipelines: definitions
                .filter(item => collectResourceReferences(item.definition).secrets.has(code))
                .map(item => item.code)
                .sort(),
            nonterminalRuns: runs
                .filter(item => collectResourceReferences(item.definition).secrets.has(code))
                .map(item => item.id)
                .sort(),
            connections: connections
                .filter(item => collectResourceReferences(item.config).secrets.has(code))
                .map(item => item.code)
                .sort(),
            destinations: destinations
                .filter(item => collectResourceReferences(item.config).secrets.has(code))
                .map(item => item.destinationId)
                .sort(),
        };
    }

    async assertSecretUnassignable(ctx: RequestContext, code: string): Promise<void> {
        const usage = await this.findSecretUsage(ctx, code, false);
        if (
            usage.publishedPipelines.length > 0
            || usage.nonterminalRuns.length > 0
            || usage.connections.length > 0
            || usage.destinations.length > 0
        ) {
            throw new ResourceInUseError(
                `Secret "${code}" is still used in the active channel`,
            );
        }
    }

    private formatUsage(label: string, values: readonly string[]): string | null {
        return values.length > 0 ? `${label}: ${values.join(', ')}` : null;
    }

    private async loadNonterminalRunDefinitions(
        ctx: RequestContext,
        channelId?: import('@vendure/core').ID,
    ): Promise<NonterminalRunDefinition[]> {
        const runs = await this.connection.getRepository(ctx, PipelineRun).find({
            where: {
                status: In([...NONTERMINAL_RUN_STATUSES]),
                ...(channelId === undefined ? {} : { channelId: String(channelId) }),
            },
            select: { id: true, definitionSnapshot: true },
            order: { id: 'ASC' },
            take: SCHEDULER.MAX_PIPELINE_DISCOVERY + 1,
        });
        if (runs.length > SCHEDULER.MAX_PIPELINE_DISCOVERY) {
            throw new Error(
                `Nonterminal pipeline run discovery exceeded the safe limit of ${SCHEDULER.MAX_PIPELINE_DISCOVERY}`,
            );
        }

        return runs.map(run => {
            if (!run.definitionSnapshot) {
                throw new Error(
                    `Definition snapshot is unavailable for nonterminal pipeline run "${String(run.id)}"`,
                );
            }
            return {
                id: String(run.id),
                definition: run.definitionSnapshot,
            };
        });
    }
}
