import { LockBackendType } from '../../../constants/enums';

export interface LockBackendPlanInput {
    forcedBackend?: string;
    redisUrl?: string;
    databaseType?: string;
}

export type LockBackendPlan =
    | { type: LockBackendType.MEMORY }
    | { type: LockBackendType.POSTGRES }
    | { type: LockBackendType.REDIS; redisUrl: string };

const LOCK_BACKEND_VALUES = new Set<string>(Object.values(LockBackendType));

export function resolveLockBackendPlan(input: LockBackendPlanInput): LockBackendPlan {
    const forcedBackend = normalizeForcedBackend(input.forcedBackend);
    const redisUrl = input.redisUrl?.trim();
    const databaseType = input.databaseType?.trim().toLowerCase();

    if (forcedBackend === LockBackendType.MEMORY) {
        return { type: LockBackendType.MEMORY };
    }

    if (forcedBackend === LockBackendType.REDIS) {
        if (!redisUrl) {
            throw new Error('DATAHUB_LOCK_BACKEND=REDIS requires DATAHUB_REDIS_URL or REDIS_URL');
        }
        return { type: LockBackendType.REDIS, redisUrl };
    }

    if (forcedBackend === LockBackendType.POSTGRES) {
        if (databaseType !== 'postgres') {
            throw new Error(
                `DATAHUB_LOCK_BACKEND=POSTGRES requires Vendure database type "postgres", received "${databaseType ?? 'unknown'}"`,
            );
        }
        return { type: LockBackendType.POSTGRES };
    }

    if (redisUrl) {
        return { type: LockBackendType.REDIS, redisUrl };
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
