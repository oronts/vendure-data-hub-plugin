import { INTERNAL_TIMINGS } from '../../../constants/defaults/core-defaults';
import { QUEUE } from '../../../constants/defaults/runtime-defaults';
import { LOGGER_CONTEXTS } from '../../../constants/core';
import { DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import {
    createPinnedAwsRequestHandler,
    type AwsRequestHandlerFactory,
} from '../../../utils/aws-request-handler.utils';
import { getErrorMessage } from '../../../utils/error.utils';
import { isBlockedHostname } from '../../../utils/url-security.utils';
import type { QueueConnectionConfig } from './queue-adapter.interface';
import { createQueueConnectionIdentity } from './connection-identity';

const logger = DataHubLoggerFactory.create(LOGGER_CONTEXTS.SQS_ADAPTER);

export interface SqsConnectionConfig extends QueueConnectionConfig {
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    accountId?: string;
    queueUrl?: string;
}

export type SqsClient = {
    send(command: unknown): Promise<unknown>;
    destroy(): void;
};

type CommandConstructor<TInput> = new (input: TInput) => unknown;

export interface SqsModule {
    SQSClient: new (config: Record<string, unknown>) => SqsClient;
    SendMessageBatchCommand: CommandConstructor<{
        QueueUrl: string;
        Entries: SqsBatchEntry[];
    }>;
    ReceiveMessageCommand: CommandConstructor<{
        QueueUrl: string;
        MaxNumberOfMessages: number;
        WaitTimeSeconds: number;
        VisibilityTimeout: number;
        MessageAttributeNames: string[];
        AttributeNames: string[];
    }>;
    DeleteMessageCommand: CommandConstructor<{
        QueueUrl: string;
        ReceiptHandle: string;
    }>;
    ChangeMessageVisibilityCommand: CommandConstructor<{
        QueueUrl: string;
        ReceiptHandle: string;
        VisibilityTimeout: number;
    }>;
    GetQueueUrlCommand: CommandConstructor<{ QueueName: string }>;
}

export interface SqsBatchEntry {
    Id: string;
    MessageBody: string;
    DelaySeconds?: number;
    MessageAttributes?: Record<
        string,
        { DataType: string; StringValue: string }
    >;
    MessageGroupId?: string;
    MessageDeduplicationId?: string;
}

let sqsModule: SqsModule | null = null;

export async function loadSqsModule(): Promise<SqsModule> {
    if (sqsModule) return sqsModule;
    try {
        const module = await (
            Function('return import("@aws-sdk/client-sqs")')() as Promise<SqsModule>
        );
        sqsModule = module;
        return module;
    } catch {
        throw new Error(
            'AWS SQS adapter requires @aws-sdk/client-sqs package. ' +
            'Install it with: npm install @aws-sdk/client-sqs',
        );
    }
}

export function sqsConnectionIdentity(config: SqsConnectionConfig): string {
    return createQueueConnectionIdentity('sqs', config);
}

export function buildSqsQueueUrl(
    config: SqsConnectionConfig,
    queueName: string,
): string {
    if (config.queueUrl?.trim()) {
        const directQueueUrl = validateSqsUrl(config.queueUrl, 'queueUrl');
        const encodedName = new URL(directQueueUrl).pathname.split('/').at(-1) ?? '';
        let directQueueName: string;
        try {
            directQueueName = decodeURIComponent(encodedName);
        } catch {
            throw new Error('Invalid SQS queueUrl queue-name encoding');
        }
        if (directQueueName === queueName) return directQueueUrl;
    }

    const accountId = config.accountId?.trim();
    if (!accountId) {
        if (config.queueUrl?.trim()) {
            throw new Error(
                `SQS queueUrl does not target requested queue '${queueName}'; ` +
                'accountId is required to construct a distinct queue URL.',
            );
        }
        throw new Error('SQS accountId is required when queueUrl is not configured.');
    }

    if (config.endpoint) {
        const endpoint = validateSqsUrl(config.endpoint, 'endpoint')
            .replace(/\/+$/, '');
        return `${endpoint}/${encodeURIComponent(accountId)}/${encodeURIComponent(queueName)}`;
    }
    const region = config.region ?? 'us-east-1';
    return `https://sqs.${region}.amazonaws.com/` +
        `${encodeURIComponent(accountId)}/${encodeURIComponent(queueName)}`;
}

export class SqsClientPool {
    private readonly clients = new Map<
        string,
        { client: SqsClient; lastUsed: number }
    >();
    private readonly pendingClients = new Map<string, Promise<SqsClient>>();
    private generation = 0;

    constructor(
        private readonly moduleLoader: typeof loadSqsModule,
        private readonly requestHandlerFactory: AwsRequestHandlerFactory =
            createPinnedAwsRequestHandler,
    ) {}

    async get(config: SqsConnectionConfig): Promise<SqsClient> {
        const key = sqsConnectionIdentity(config);
        const cached = this.clients.get(key);
        if (cached) {
            cached.lastUsed = Date.now();
            return cached.client;
        }

        const pending = this.pendingClients.get(key);
        if (pending) return pending;

        const generation = this.generation;
        const creation = this.create(config, key, generation);
        this.pendingClients.set(key, creation);
        try {
            return await creation;
        } finally {
            this.pendingClients.delete(key);
        }
    }

    private async create(
        config: SqsConnectionConfig,
        key: string,
        generation: number,
    ): Promise<SqsClient> {
        const customEndpoint = resolveCustomSqsEndpoint(config);
        const clientConfig: Record<string, unknown> = {
            region: config.region ?? 'us-east-1',
        };
        if (config.queueUrl !== undefined) {
            validateSqsUrl(config.queueUrl, 'queueUrl');
        }
        if (Boolean(config.accessKeyId) !== Boolean(config.secretAccessKey)) {
            throw new Error(
                'SQS accessKeyId and secretAccessKey must be configured together',
            );
        }
        if (config.accessKeyId && config.secretAccessKey) {
            clientConfig.credentials = {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            };
        }
        if (config.endpoint) {
            clientConfig.endpoint = validateSqsUrl(config.endpoint, 'endpoint');
        }

        const requestHandler = await this.requestHandlerFactory(customEndpoint);
        let client: SqsClient | undefined;
        try {
            const module = await this.moduleLoader();
            if (requestHandler) {
                clientConfig.requestHandler = requestHandler;
            }
            client = new module.SQSClient(clientConfig) as unknown as SqsClient;
            if (generation !== this.generation) {
                throw new Error('SQS client pool was destroyed during connection setup');
            }
            if (this.clients.size >= QUEUE.MAX_CONSUMERS) {
                throw new Error(
                    `SQS client pool capacity of ${QUEUE.MAX_CONSUMERS} was reached`,
                );
            }
            this.clients.set(key, { client, lastUsed: Date.now() });
            return client;
        } catch (error) {
            if (client) {
                this.close(client);
            } else {
                closeRequestHandler(requestHandler);
            }
            throw error;
        }
    }

    cleanupIdle(now = Date.now()): void {
        for (const [key, entry] of this.clients.entries()) {
            if (now - entry.lastUsed > INTERNAL_TIMINGS.CONNECTION_MAX_IDLE_MS) {
                this.clients.delete(key);
                this.close(entry.client);
            }
        }
    }

    async destroy(): Promise<void> {
        this.generation++;
        await Promise.allSettled(this.pendingClients.values());
        const clients = [...this.clients.values()].map(entry => entry.client);
        this.clients.clear();
        clients.forEach(client => this.close(client));
    }

    private close(client: SqsClient): void {
        try {
            client.destroy();
        } catch (error) {
            logger.warn('Failed to close SQS client', {
                error: getErrorMessage(error),
            });
        }
    }
}

function closeRequestHandler(
    requestHandler: Awaited<ReturnType<AwsRequestHandlerFactory>>,
): void {
    try {
        requestHandler?.destroy();
    } catch (error) {
        logger.warn('Failed to close SQS request handler', {
            error: getErrorMessage(error),
        });
    }
}

function validateSqsUrl(value: string, field: 'endpoint' | 'queueUrl'): string {
    const normalizedValue = value.trim();
    let parsed: URL;
    try {
        parsed = new URL(normalizedValue);
    } catch {
        throw new Error(`Invalid SQS ${field} URL: ${value}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`SQS ${field} must use http or https`);
    }
    if (parsed.username || parsed.password) {
        throw new Error(`SQS ${field} must not contain URL credentials`);
    }
    if (isBlockedHostname(parsed.hostname)) {
        throw new Error(
            `SSRF protection: ${field} hostname '${parsed.hostname}' is blocked for security reasons`,
        );
    }
    return normalizedValue;
}

function resolveCustomSqsEndpoint(config: SqsConnectionConfig): string | undefined {
    if (config.endpoint?.trim()) {
        return validateSqsUrl(config.endpoint, 'endpoint');
    }
    if (!config.queueUrl?.trim()) return undefined;

    const queueUrl = validateSqsUrl(config.queueUrl, 'queueUrl');
    const parsed = new URL(queueUrl);
    const isAwsEndpoint = parsed.hostname.endsWith('.amazonaws.com') ||
        parsed.hostname.endsWith('.amazonaws.com.cn');
    return isAwsEndpoint ? undefined : parsed.origin;
}
