import { SANDBOX } from '../../../constants';

export interface SandboxOptions {
    maxRecords?: number;
    maxSamplesPerStep?: number;
    includeLineage?: boolean;
    seedData?: Record<string, unknown>[];
    stopOnError?: boolean;
    timeoutMs?: number;
    skipSteps?: string[];
    startFromStep?: string;
}

export interface NormalizedSandboxOptions {
    maxRecords: number;
    maxSamplesPerStep: number;
    includeLineage: boolean;
    seedData: Record<string, unknown>[];
    stopOnError: boolean;
    timeoutMs: number;
    skipSteps: string[];
    startFromStep: string;
}

export function normalizeSandboxOptions(
    options: SandboxOptions = {},
): NormalizedSandboxOptions {
    const maxRecords = boundedInteger(
        options.maxRecords ?? SANDBOX.MAX_RECORDS,
        'maxRecords',
        SANDBOX.MAX_RECORDS,
    );
    const maxSamplesPerStep = boundedInteger(
        options.maxSamplesPerStep ?? SANDBOX.MAX_SAMPLES_PER_STEP,
        'maxSamplesPerStep',
        SANDBOX.MAX_SAMPLES_PER_STEP,
    );
    const timeoutMs = boundedInteger(
        options.timeoutMs ?? SANDBOX.DEFAULT_TIMEOUT_MS,
        'timeoutMs',
        SANDBOX.MAX_TIMEOUT_MS,
    );
    const seedData = options.seedData ?? [];
    if (!seedData.every(isRecord)) {
        throw new Error('seedData must contain JSON objects');
    }
    const skipSteps = options.skipSteps ?? [];
    if (!skipSteps.every(stepKey => typeof stepKey === 'string' && stepKey.trim().length > 0)) {
        throw new Error('skipSteps must contain non-empty step keys');
    }
    if (
        options.startFromStep != null
        && options.startFromStep.trim().length === 0
    ) {
        throw new Error('startFromStep must be a non-empty step key');
    }

    return {
        maxRecords,
        maxSamplesPerStep,
        includeLineage: options.includeLineage ?? true,
        seedData: seedData.slice(0, maxRecords),
        stopOnError: options.stopOnError ?? false,
        timeoutMs,
        skipSteps: [...new Set(skipSteps)],
        startFromStep: options.startFromStep ?? '',
    };
}

function boundedInteger(value: number, name: string, maximum: number): number {
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
        throw new Error(`${name} must be an integer from 1 to ${maximum}`);
    }
    return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object' && !Array.isArray(value);
}
