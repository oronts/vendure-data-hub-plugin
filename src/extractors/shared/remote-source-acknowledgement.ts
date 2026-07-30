import type { ID } from '@vendure/core';
import type { JsonObject, JsonValue } from '../../types';

export const REMOTE_SOURCE_ACKNOWLEDGEMENTS_KEY = 'pendingRemoteSourceAcknowledgements';

export type RemoteSourceAdapterCode = 'ftp' | 's3';
export type RemoteSourceAcknowledgementAction = 'DELETE' | 'MOVE';

export interface RemoteSourceAcknowledgement extends JsonObject {
    id: string;
    runId: string;
    stepKey: string;
    adapterCode: RemoteSourceAdapterCode;
    action: RemoteSourceAcknowledgementAction;
    sourcePath: string;
    destinationPath: string | null;
    config: JsonObject;
}

interface CreateRemoteSourceAcknowledgementInput {
    runId: ID;
    stepKey: string;
    adapterCode: RemoteSourceAdapterCode;
    action: RemoteSourceAcknowledgementAction;
    sourcePath: string;
    destinationPath?: string;
    config: JsonObject;
}

export function createRemoteSourceAcknowledgement(
    input: CreateRemoteSourceAcknowledgementInput,
): RemoteSourceAcknowledgement {
    const runId = String(input.runId);
    const destinationPath = input.destinationPath ?? null;
    return {
        id: [
            runId,
            input.stepKey,
            input.adapterCode,
            input.action,
            input.sourcePath,
            destinationPath ?? '',
        ].join('\u0000'),
        runId,
        stepKey: input.stepKey,
        adapterCode: input.adapterCode,
        action: input.action,
        sourcePath: input.sourcePath,
        destinationPath,
        config: input.config,
    };
}

export function appendRemoteSourceAcknowledgement(
    checkpoint: JsonObject,
    acknowledgement: RemoteSourceAcknowledgement,
): JsonObject {
    const existing = readRemoteSourceAcknowledgements(checkpoint);
    if (existing.some(item => item.id === acknowledgement.id)) {
        return checkpoint;
    }
    return {
        ...checkpoint,
        [REMOTE_SOURCE_ACKNOWLEDGEMENTS_KEY]: [
            ...existing,
            acknowledgement,
        ],
    };
}

export function readRemoteSourceAcknowledgements(
    checkpoint: JsonObject | undefined,
): RemoteSourceAcknowledgement[] {
    const value = checkpoint?.[REMOTE_SOURCE_ACKNOWLEDGEMENTS_KEY];
    if (!Array.isArray(value)) return [];

    return value.filter(isRemoteSourceAcknowledgement);
}

export function removeRemoteSourceAcknowledgements(
    checkpoint: JsonObject,
    acknowledgementIds: ReadonlySet<string>,
): JsonObject {
    const remaining = readRemoteSourceAcknowledgements(checkpoint)
        .filter(item => !acknowledgementIds.has(item.id));
    if (remaining.length === 0) {
        const next = { ...checkpoint };
        delete next[REMOTE_SOURCE_ACKNOWLEDGEMENTS_KEY];
        return next;
    }
    return {
        ...checkpoint,
        [REMOTE_SOURCE_ACKNOWLEDGEMENTS_KEY]: remaining as unknown as JsonValue,
    };
}

function isRemoteSourceAcknowledgement(
    value: unknown,
): value is RemoteSourceAcknowledgement {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const item = value as JsonObject;
    return typeof item.id === 'string'
        && typeof item.runId === 'string'
        && typeof item.stepKey === 'string'
        && (item.adapterCode === 'ftp' || item.adapterCode === 's3')
        && (item.action === 'DELETE' || item.action === 'MOVE')
        && typeof item.sourcePath === 'string'
        && (item.destinationPath === null || typeof item.destinationPath === 'string')
        && !!item.config
        && typeof item.config === 'object'
        && !Array.isArray(item.config);
}
