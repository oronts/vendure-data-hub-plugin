import { LockBackendType } from '../../../constants/enums';

export interface LockBackendPlanInput {
    forcedBackend?: string;
    redisConfigured?: boolean;
    databaseType?: string;
}

export type LockBackendPlan =
    | { type: LockBackendType.MEMORY }
    | { type: LockBackendType.POSTGRES }
    | { type: LockBackendType.REDIS };

const LOCK_BACKEND_VALUES = new Set<string>(Object.values(LockBackendType));

export function resolveLockBackendPlan(input: LockBackendPlanInput): LockBackendPlan {
    const forcedBackend = normalizeForcedBackend(input.forcedBackend);
    const databaseType = input.databaseType?.trim().toLowerCase();

    if (forcedBackend === LockBackendType.MEMORY) {
        return { type: LockBackendType.MEMORY };
    }

    if (forcedBackend === LockBackendType.REDIS) {
        if (!input.redisConfigured) {
            throw new Error(
                'DATAHUB_LOCK_BACKEND=REDIS requires a Redis URL or Sentinel configuration',
            );
        }
        return { type: LockBackendType.REDIS };
    }

    if (forcedBackend === LockBackendType.POSTGRES) {
        if (databaseType !== 'postgres') {
            throw new Error(
                `DATAHUB_LOCK_BACKEND=POSTGRES requires Vendure database type "postgres", received "${databaseType ?? 'unknown'}"`,
            );
        }
        return { type: LockBackendType.POSTGRES };
    }

    if (input.redisConfigured) {
        return { type: LockBackendType.REDIS };
    }

    if (databaseType === 'postgres') {
        return { type: LockBackendType.POSTGRES };
    }

    throw new Error(
        `No distributed lock backend is available for Vendure database type "${databaseType ?? 'unknown'}". Configure Redis or explicitly select MEMORY for a single-process deployment.`,
    );
}

function normalizeForcedBackend(value?: string): LockBackendType | undefined {
    const normalized = value?.trim().toUpperCase();
    if (!normalized) {
        return undefined;
    }
    if (!LOCK_BACKEND_VALUES.has(normalized)) {
        throw new Error(
            `Invalid DATAHUB_LOCK_BACKEND "${value}". Expected REDIS, POSTGRES, or MEMORY.`,
        );
    }
    return normalized as LockBackendType;
}
