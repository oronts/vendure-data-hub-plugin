import type { DeletionResponse } from '@vendure/common/lib/generated-types';
import { DeletionResult } from '@vendure/common/lib/generated-types';
import { EntityNotFoundError } from '@vendure/core';
import type { ID } from '@vendure/core';

export class DeletionTargetNotFoundError extends Error {}

export function isDeletionTargetNotFoundError(error: unknown): boolean {
    return error instanceof DeletionTargetNotFoundError
        || error instanceof EntityNotFoundError;
}

export function assertDeletionSucceeded(
    entityType: string,
    identifier: string,
    response: DeletionResponse,
): void {
    if (response.result === DeletionResult.DELETED) {
        return;
    }
    const detail = response.message ?? 'Vendure rejected the deletion';
    throw new Error(`Failed to delete ${entityType} "${identifier}": ${detail}`);
}

export function resolveUniqueDeletionTargetId(
    items: ReadonlyArray<{ id: ID }>,
    entityType: string,
    identifier: string,
): ID | undefined {
    if (items.length > 1) {
        throw new Error(`Multiple ${entityType} records match "${identifier}"`);
    }
    return items[0]?.id;
}
