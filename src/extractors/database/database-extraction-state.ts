import type { JsonObject } from '../../types';
import { DatabasePaginationType } from '../../constants';
import type {
    DatabaseCursorValue,
    DatabaseExtractorConfig,
    PaginationState,
} from './types';

const INCREMENTAL_VALUE_KEY = 'lastIncrementalValue';
const INCREMENTAL_TIE_BREAKER_KEY = 'lastIncrementalTieBreaker';

function normalizeCursorValue(value: unknown, column: string): DatabaseCursorValue {
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    throw new Error(
        `Cursor column "${column}" must contain a non-null scalar value in the page boundary row`,
    );
}

function serializeCursorValue(value: DatabaseCursorValue): string | number | boolean {
    return value instanceof Date ? value.toISOString() : value;
}

export function assertCursorBoundaryValue(
    value: unknown,
    column: string,
): asserts value is DatabaseCursorValue {
    normalizeCursorValue(value, column);
}

export function createInitialPaginationState(
    config: DatabaseExtractorConfig,
    checkpointData: JsonObject | undefined,
): PaginationState {
    const state: PaginationState = { offset: 0 };
    if (!config.incremental?.enabled) return state;

    const pagination = config.pagination;
    if (
        !pagination?.enabled
        || pagination.type !== DatabasePaginationType.CURSOR
        || pagination.cursorColumn !== config.incremental.column
        || !pagination.cursorTieBreakerColumn
    ) {
        throw new Error(
            'Incremental extraction requires cursor pagination on the incremental column with a unique tie-breaker',
        );
    }

    const value = checkpointData?.[INCREMENTAL_VALUE_KEY];
    const tieBreaker = checkpointData?.[INCREMENTAL_TIE_BREAKER_KEY];
    if (value === undefined && tieBreaker === undefined) return state;
    if (value === undefined || tieBreaker === undefined) {
        throw new Error(
            `Incremental checkpoint requires both "${INCREMENTAL_VALUE_KEY}" and "${INCREMENTAL_TIE_BREAKER_KEY}"`,
        );
    }

    state.cursor = normalizeCursorValue(value, pagination.cursorColumn);
    state.cursorTieBreaker = normalizeCursorValue(
        tieBreaker,
        pagination.cursorTieBreakerColumn,
    );
    return state;
}

export function createIncrementalCheckpoint(
    config: DatabaseExtractorConfig,
    state: PaginationState,
): JsonObject | undefined {
    if (!config.incremental?.enabled) return undefined;
    if (state.cursor === undefined || state.cursorTieBreaker === undefined) return undefined;

    return {
        [INCREMENTAL_VALUE_KEY]: serializeCursorValue(state.cursor),
        [INCREMENTAL_TIE_BREAKER_KEY]: serializeCursorValue(state.cursorTieBreaker),
    };
}
