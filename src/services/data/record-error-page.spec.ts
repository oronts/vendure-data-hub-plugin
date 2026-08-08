import { describe, expect, it } from 'vitest';
import { UserInputError } from '@vendure/core';
import {
    decodeRecordErrorCursor,
    encodeRecordErrorCursor,
    parseRecordErrorPageSize,
} from './record-error-page';

describe('record error pagination', () => {
    it('round-trips numeric and UUID entity IDs', () => {
        const createdAt = new Date('2026-07-16T10:00:00.000Z');
        for (const id of [42, '89af9ee4-1602-409f-a530-fd96d4f7a34b']) {
            const cursor = encodeRecordErrorCursor({ id, createdAt } as never);
            expect(decodeRecordErrorCursor(cursor)).toEqual({ id, createdAt });
        }
    });

    it('rejects malformed cursors and page sizes', () => {
        expect(() => decodeRecordErrorCursor('not-a-cursor')).toThrow(UserInputError);
        expect(() => parseRecordErrorPageSize(0)).toThrow(UserInputError);
        expect(() => parseRecordErrorPageSize(501)).toThrow(UserInputError);
    });
});
