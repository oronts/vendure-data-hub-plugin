import type { RetryConfig } from '../../../shared/types';
import { decryptSecret, encryptSecret, getMasterKey } from '../../utils/encryption.utils';
import type { WebhookConfig } from './webhook.types';

const REPLAY_ENVELOPE_VERSION = 1;
const MINIMUM_MASTER_KEY_LENGTH = 32;

export interface WebhookReplayEnvelope {
    version: typeof REPLAY_ENVELOPE_VERSION;
    config: WebhookConfig;
    serializedPayload: string;
    additionalHeaders: Record<string, string>;
    idempotencyKey?: string;
}

export async function encryptWebhookReplayEnvelope(
    envelope: Omit<WebhookReplayEnvelope, 'version'>,
): Promise<string> {
    return encryptSecret(
        JSON.stringify({ version: REPLAY_ENVELOPE_VERSION, ...envelope }),
        requireMasterKey(),
    );
}

export async function decryptWebhookReplayEnvelope(
    encryptedEnvelope: string,
): Promise<WebhookReplayEnvelope> {
    const plaintext = await decryptSecret(encryptedEnvelope, requireMasterKey());
    return parseReplayEnvelope(plaintext);
}

function requireMasterKey(): string {
    const masterKey = getMasterKey();
    if (!masterKey || masterKey.length < MINIMUM_MASTER_KEY_LENGTH) {
        throw new Error(
            'Durable webhook delivery requires DATAHUB_MASTER_KEY with at least 32 characters',
        );
    }
    return masterKey;
}

function parseReplayEnvelope(serialized: string): WebhookReplayEnvelope {
    let value: unknown;
    try {
        value = JSON.parse(serialized) as unknown;
    } catch {
        throw new Error('Stored webhook replay envelope is invalid');
    }
    if (!isRecord(value) || value.version !== REPLAY_ENVELOPE_VERSION) {
        throw new Error('Stored webhook replay envelope has an unsupported version');
    }
    if (
        !isWebhookConfig(value.config) ||
        typeof value.serializedPayload !== 'string' ||
        !isStringRecord(value.additionalHeaders) ||
        (value.idempotencyKey !== undefined && typeof value.idempotencyKey !== 'string')
    ) {
        throw new Error('Stored webhook replay envelope is malformed');
    }
    return {
        version: REPLAY_ENVELOPE_VERSION,
        config: value.config,
        serializedPayload: value.serializedPayload,
        additionalHeaders: value.additionalHeaders,
        idempotencyKey: value.idempotencyKey,
    };
}

function isWebhookConfig(value: unknown): value is WebhookConfig {
    if (!isRecord(value)) return false;
    return (
        typeof value.id === 'string' &&
        typeof value.url === 'string' &&
        (value.method === undefined || isWebhookMethod(value.method)) &&
        (value.headers === undefined || isStringRecord(value.headers)) &&
        (value.secretCode === undefined || typeof value.secretCode === 'string') &&
        (value.headerSecretCodes === undefined || isStringRecord(value.headerSecretCodes)) &&
        (value.signatureHeader === undefined || typeof value.signatureHeader === 'string') &&
        (value.retryConfig === undefined || isRetryConfig(value.retryConfig)) &&
        (value.enabled === undefined || typeof value.enabled === 'boolean')
    );
}

function isWebhookMethod(value: unknown): value is NonNullable<WebhookConfig['method']> {
    return value === 'POST' || value === 'PUT' || value === 'PATCH';
}

function isRetryConfig(value: unknown): value is RetryConfig {
    return (
        isRecord(value) &&
        typeof value.maxAttempts === 'number' &&
        typeof value.initialDelayMs === 'number' &&
        typeof value.maxDelayMs === 'number' &&
        typeof value.backoffMultiplier === 'number' &&
        (value.jitterFactor === undefined ||
            (typeof value.jitterFactor === 'number' &&
                Number.isFinite(value.jitterFactor) &&
                value.jitterFactor >= 0 &&
                value.jitterFactor <= 1)) &&
        (value.retryableStatusCodes === undefined ||
            (Array.isArray(value.retryableStatusCodes) &&
                value.retryableStatusCodes.every(
                    (status: unknown) =>
                        typeof status === 'number' &&
                        Number.isInteger(status) &&
                        status >= 400 &&
                        status <= 599,
                )))
    );
}

function isStringRecord(value: unknown): value is Record<string, string> {
    return isRecord(value) && Object.values(value).every(item => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
