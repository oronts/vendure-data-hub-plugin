import { createHash } from 'crypto';
import type { ID } from '@vendure/core';

export interface PipelineRunIdempotencyScope {
    channelId: string;
    triggerKeyHash: string;
    keyHash: string;
    payloadHash: string;
    expiresAt: Date;
}

export class PipelineRunIdempotencyConflictError extends Error {
    constructor() {
        super('Idempotency key was already used with a different webhook payload');
        this.name = 'PipelineRunIdempotencyConflictError';
    }
}

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

export function createPipelineRunIdempotencyScope(
    channelId: ID,
    triggerKey: string,
    key: string,
    requestFingerprint: string,
    ttlSeconds: number,
    now = new Date(),
): PipelineRunIdempotencyScope {
    return {
        channelId: String(channelId),
        triggerKeyHash: sha256(triggerKey),
        keyHash: sha256(key),
        payloadHash: sha256(requestFingerprint),
        expiresAt: new Date(now.getTime() + ttlSeconds * 1_000),
    };
}
