import { describe, expect, it } from 'vitest';
import {
    parseElasticBulkResult,
    parseTypesenseImportResult,
    readNumericTaskId,
    readTaskStatus,
} from './search-sink-results';

describe('search sink response contracts', () => {
    it('correlates Elasticsearch bulk item failures', () => {
        expect(parseElasticBulkResult(JSON.stringify({
            errors: true,
            items: [
                { index: { _id: 'one', status: 201 } },
                {
                    index: {
                        _id: 'two',
                        status: 400,
                        error: { type: 'mapper_parsing_exception', reason: 'price is invalid' },
                    },
                },
            ],
        }), 2)).toEqual({
            ok: 1,
            fail: 1,
            errors: [{ index: 1, message: 'price is invalid' }],
        });
    });

    it('fails closed when Elasticsearch omits item results', () => {
        expect(parseElasticBulkResult(JSON.stringify({
            errors: false,
            items: [{ index: { status: 201 } }],
        }), 2)).toMatchObject({ ok: 0, fail: 2 });
    });

    it('correlates Typesense NDJSON import failures', () => {
        expect(parseTypesenseImportResult([
            JSON.stringify({ success: true }),
            JSON.stringify({ success: false, error: 'Field price must be an int32' }),
        ].join('\n'), 2)).toEqual({
            ok: 1,
            fail: 1,
            errors: [{ index: 1, message: 'Field price must be an int32' }],
        });
    });

    it('validates async task identifiers and status objects', () => {
        expect(readNumericTaskId('{"taskUid":42}', 'taskUid', 'MeiliSearch')).toBe(42);
        expect(readNumericTaskId('{"taskID":17}', 'taskID', 'Algolia')).toBe(17);
        expect(readTaskStatus('{"status":"failed","error":{"message":"index rejected"}}', 'MeiliSearch'))
            .toEqual({ status: 'failed', error: 'index rejected' });
        expect(() => readNumericTaskId('{}', 'taskUid', 'MeiliSearch'))
            .toThrow('valid taskUid');
    });
});
