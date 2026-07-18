import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import {
    DataHubConnection,
    DataHubExportDestination,
    DataHubSecret,
} from '../../entities/config';
import type { PipelineDefinition } from '../../types';
import { loadActivePipelineDefinitions } from '../pipeline/active-pipeline-definitions';
import { SecretService } from './secret.service';

export interface ResourceReferences {
    readonly connections: ReadonlySet<string>;
    readonly secrets: ReadonlySet<string>;
}

export interface SecretReferenceUsage {
    readonly publishedPipelines: readonly string[];
    readonly connections: readonly string[];
    readonly destinations: readonly string[];
}

export interface MissingResourceReferences {
    readonly connections: readonly string[];
    readonly secrets: readonly string[];
}

const CONNECTION_CODE_KEY = /connectionCode$/i;
const SECRET_CODE_KEY = /secretCode$/i;
const SECRET_CODES_KEY = /secretCodes$/i;

function addStringReference(value: unknown, target: Set<string>): void {
    if (typeof value !== 'string') {
        return;
    }
    const code = value.trim();
    if (code) {
        target.add(code);
    }
}

function addStringReferences(value: unknown, target: Set<string>): void {
    if (typeof value === 'string') {
        addStringReference(value, target);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            addStringReferences(item, target);
        }
        return;
    }
    if (value && typeof value === 'object') {
        for (const item of Object.values(value)) {
            addStringReferences(item, target);
        }
    }
}

export function collectResourceReferences(value: unknown): ResourceReferences {
    const connections = new Set<string>();
    const secrets = new Set<string>();
    const visited = new WeakSet<object>();

    const visit = (candidate: unknown): void => {
        if (!candidate || typeof candidate !== 'object') {
            return;
        }
        if (visited.has(candidate)) {
            return;
        }
        visited.add(candidate);

        if (Array.isArray(candidate)) {
            for (const item of candidate) {
                visit(item);
            }
            return;
        }

        for (const [key, item] of Object.entries(candidate)) {
            if (CONNECTION_CODE_KEY.test(key)) {
                addStringReference(item, connections);
            }
            if (SECRET_CODE_KEY.test(key)) {
                addStringReference(item, secrets);
            } else if (SECRET_CODES_KEY.test(key)) {
                addStringReferences(item, secrets);
            }
            visit(item);
        }
    };

    visit(value);
    return { connections, secrets };
}

export class ResourceInUseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ResourceInUseError';
    }
}

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
                where: { code: In(connectionCodes) },
                select: { code: true, config: true },
            });
        const foundConnectionCodes = new Set(connections.map(item => item.code));
        const secretCodes = new Set(references.secrets);
        for (const connection of connections) {
            for (const secretCode of collectResourceReferences(connection.config).secrets) {
                secretCodes.add(secretCode);
            }
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
        const definitions = await loadActivePipelineDefinitions(this.connection, ctx);
        const publishedPipelines = definitions
            .filter(item => collectResourceReferences(item.definition).connections.has(code))
            .map(item => item.code)
            .sort();

        if (publishedPipelines.length > 0) {
            throw new ResourceInUseError(
                `Connection "${code}" is referenced by published pipelines: ${publishedPipelines.join(', ')}. `
                + 'Update and republish those pipelines before renaming or deleting the connection.',
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
    ): Promise<SecretReferenceUsage> {
        const [definitions, connections, destinations] = await Promise.all([
            loadActivePipelineDefinitions(this.connection, ctx),
            this.connection.getRepository(ctx, DataHubConnection).find({
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

    private formatUsage(label: string, values: readonly string[]): string | null {
        return values.length > 0 ? `${label}: ${values.join(', ')}` : null;
    }
}
