import { describe, expect, it } from 'vitest';
import {
    resolveLineageRecordLimit,
    revisionsBelongToPipeline,
} from './sandbox-request.validation';

describe('resolveLineageRecordLimit', () => {
    it('expands a valid requested limit to include the selected record', () => {
        expect(resolveLineageRecordLimit(9, 5)).toBe(10);
        expect(resolveLineageRecordLimit(0)).toBe(100);
    });

    it.each([-1, 1.5, 100, Number.NaN, Number.POSITIVE_INFINITY])(
        'rejects an invalid record index: %s',
        recordIndex => {
            expect(() => resolveLineageRecordLimit(recordIndex, 10)).toThrow(
                'recordIndex must be an integer from 0 to 99',
            );
        },
    );

    it('does not mask an invalid requested limit', () => {
        expect(() => resolveLineageRecordLimit(0, 0)).toThrow(
            'recordLimit must be an integer from 1 to 100',
        );
    });
});

describe('revisionsBelongToPipeline', () => {
    it('accepts Vendure IDs with equivalent serialized values', () => {
        expect(revisionsBelongToPipeline('42', [42, '42'])).toBe(true);
    });

    it('rejects a revision from another pipeline', () => {
        expect(revisionsBelongToPipeline('42', ['42', '43'])).toBe(false);
    });
});
