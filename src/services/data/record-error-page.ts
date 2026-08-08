import { ID, UserInputError } from '@vendure/core';
import { PAGINATION } from '../../constants';
import type { DataHubRecordError } from '../../entities/data';

interface RecordErrorCursor {
    createdAt: Date;
    id: ID;
}

export interface RecordErrorPageOptions {
    first?: number;
    after?: string;
}

export interface RecordErrorPage {
    items: DataHubRecordError[];
    totalItems: number;
    hasNextPage: boolean;
    endCursor: string | null;
}

export function parseRecordErrorPageSize(first: number | undefined): number {
    const pageSize = first ?? PAGINATION.LIST_PAGE_SIZE;
    if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > PAGINATION.MAX_QUERY_LIMIT) {
        throw new UserInputError(
            `first must be a positive integer no greater than ${PAGINATION.MAX_QUERY_LIMIT}`,
        );
    }
    return pageSize;
}

export function encodeRecordErrorCursor(item: Pick<DataHubRecordError, 'createdAt' | 'id'>): string {
    return Buffer.from(JSON.stringify({
        createdAt: item.createdAt.toISOString(),
        id: item.id,
    })).toString('base64url');
}

export function decodeRecordErrorCursor(value: string | undefined): RecordErrorCursor | null {
    if (!value) return null;
    try {
        const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
        if (!decoded || typeof decoded !== 'object') throw new Error('cursor payload is not an object');
        const createdAtValue = Reflect.get(decoded, 'createdAt');
        const id = Reflect.get(decoded, 'id');
        const createdAt = new Date(String(createdAtValue));
        if (Number.isNaN(createdAt.getTime()) || (typeof id !== 'string' && typeof id !== 'number')) {
            throw new Error('cursor fields are invalid');
        }
        return { createdAt, id };
    } catch {
        throw new UserInputError('Invalid record error cursor');
    }
}
