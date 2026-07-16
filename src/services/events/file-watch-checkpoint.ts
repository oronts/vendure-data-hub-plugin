import { RunStatus } from '../../constants/enums';
import type { JsonObject, JsonValue } from '../../types/index';

export const FILE_WATCH_CHECKPOINTS_KEY = 'fileWatchCheckpoints';

export interface DiscoveredFile {
    path: string;
    name: string;
    modifiedAt: Date;
    size: number;
}

export interface FileWatchPosition {
    modifiedAt: string;
    path: string;
}

export interface PendingFileRun {
    file: {
        path: string;
        name: string;
        modifiedAt: string;
        size: number;
    };
    attempt: number;
    runId?: string;
}

export interface FileWatchCheckpointState {
    cursor?: FileWatchPosition;
    pending?: PendingFileRun;
}

const TERMINAL_FAILURE_STATUSES = new Set<RunStatus>([
    RunStatus.FAILED,
    RunStatus.TIMEOUT,
    RunStatus.CANCELLED,
]);

export function createFilePosition(file: DiscoveredFile): FileWatchPosition {
    return {
        modifiedAt: file.modifiedAt.toISOString(),
        path: file.path,
    };
}

export function compareFilePositions(left: FileWatchPosition, right: FileWatchPosition): number {
    const timeDifference = Date.parse(left.modifiedAt) - Date.parse(right.modifiedAt);
    if (timeDifference !== 0) return timeDifference;
    if (left.path < right.path) return -1;
    if (left.path > right.path) return 1;
    return 0;
}

export function findNextEligibleFile(
    files: DiscoveredFile[],
    cursor: FileWatchPosition | undefined,
    now: Date,
    minFileAgeMs: number,
): DiscoveredFile | undefined {
    return files
        .filter(file => Number.isFinite(file.modifiedAt.getTime()))
        .filter(file => now.getTime() - file.modifiedAt.getTime() >= minFileAgeMs)
        .filter(file => !cursor || compareFilePositions(createFilePosition(file), cursor) > 0)
        .sort((left, right) => compareFilePositions(createFilePosition(left), createFilePosition(right)))[0];
}

export function createPendingFileRun(file: DiscoveredFile): PendingFileRun {
    return {
        file: {
            path: file.path,
            name: file.name,
            modifiedAt: file.modifiedAt.toISOString(),
            size: file.size,
        },
        attempt: 0,
    };
}

export function pendingFilePosition(pending: PendingFileRun): FileWatchPosition {
    return {
        modifiedAt: pending.file.modifiedAt,
        path: pending.file.path,
    };
}

export function isTerminalFailureStatus(status: RunStatus): boolean {
    return TERMINAL_FAILURE_STATUSES.has(status);
}

export function readFileWatchCheckpoint(
    data: JsonObject | null | undefined,
    triggerKey: string,
): FileWatchCheckpointState {
    const rawStates = data?.[FILE_WATCH_CHECKPOINTS_KEY];
    if (rawStates === undefined) return {};

    const allStates = asObject(rawStates);
    if (!allStates) throw new Error('Invalid FILE-watch checkpoint collection');

    const rawState = allStates[triggerKey];
    if (rawState === undefined) return {};

    const state = asObject(rawState);
    if (!state) throw new Error(`Invalid FILE-watch checkpoint for trigger "${triggerKey}"`);

    const cursor = state.cursor === undefined ? undefined : parsePosition(state.cursor);
    const pending = state.pending === undefined ? undefined : parsePending(state.pending);
    if (state.cursor !== undefined && !cursor) {
        throw new Error(`Invalid FILE-watch cursor for trigger "${triggerKey}"`);
    }
    if (state.pending !== undefined && !pending) {
        throw new Error(`Invalid pending FILE run for trigger "${triggerKey}"`);
    }

    return {
        ...(cursor ? { cursor } : {}),
        ...(pending ? { pending } : {}),
    };
}

export function writeFileWatchCheckpoint(
    data: JsonObject,
    triggerKey: string,
    state: FileWatchCheckpointState,
): JsonObject {
    const rawStates = data[FILE_WATCH_CHECKPOINTS_KEY];
    const existingStates = rawStates === undefined ? {} : asObject(rawStates);
    if (!existingStates) throw new Error('Invalid FILE-watch checkpoint collection');
    const serializedState: JsonObject = {};
    if (state.cursor) {
        serializedState.cursor = {
            modifiedAt: state.cursor.modifiedAt,
            path: state.cursor.path,
        };
    }
    if (state.pending) {
        serializedState.pending = {
            file: {
                path: state.pending.file.path,
                name: state.pending.file.name,
                modifiedAt: state.pending.file.modifiedAt,
                size: state.pending.file.size,
            },
            attempt: state.pending.attempt,
            ...(state.pending.runId ? { runId: state.pending.runId } : {}),
        };
    }

    return {
        ...data,
        [FILE_WATCH_CHECKPOINTS_KEY]: {
            ...existingStates,
            [triggerKey]: serializedState,
        },
    };
}

function parsePosition(value: JsonValue | undefined): FileWatchPosition | undefined {
    const position = asObject(value);
    if (!position || typeof position.modifiedAt !== 'string' || typeof position.path !== 'string') {
        return undefined;
    }
    if (!Number.isFinite(Date.parse(position.modifiedAt))) return undefined;
    return { modifiedAt: position.modifiedAt, path: position.path };
}

function parsePending(value: JsonValue | undefined): PendingFileRun | undefined {
    const pending = asObject(value);
    const file = asObject(pending?.file);
    if (
        !pending ||
        !file ||
        typeof file.path !== 'string' ||
        typeof file.name !== 'string' ||
        typeof file.modifiedAt !== 'string' ||
        !Number.isFinite(Date.parse(file.modifiedAt)) ||
        typeof file.size !== 'number' ||
        !Number.isFinite(file.size) ||
        typeof pending.attempt !== 'number' ||
        !Number.isSafeInteger(pending.attempt) ||
        pending.attempt < 0 ||
        (pending.runId !== undefined && typeof pending.runId !== 'string')
    ) {
        return undefined;
    }

    return {
        file: {
            path: file.path,
            name: file.name,
            modifiedAt: file.modifiedAt,
            size: file.size,
        },
        attempt: pending.attempt,
        ...(typeof pending.runId === 'string' ? { runId: pending.runId } : {}),
    };
}

function asObject(value: JsonValue | JsonObject | null | undefined): JsonObject | undefined {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as JsonObject;
}
