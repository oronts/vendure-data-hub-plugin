import { describe, expect, it } from 'vitest';
import {
    createRemoteFileSourceRecord,
    readRemoteFileSourceReferences,
} from './remote-file-source';

describe('remote file source references', () => {
    const reference = {
        connectionCode: 'incoming-sftp',
        path: '/incoming/products.csv',
        name: 'products.csv',
        modifiedAt: '2026-07-15T10:00:00.000Z',
        size: 128,
    };

    it('round-trips the reserved source record without exposing flat control fields', () => {
        const record = createRemoteFileSourceRecord(reference);

        expect(record).toEqual({ __dataHubRemoteFile: reference });
        expect(readRemoteFileSourceReferences([record], 'incoming-sftp')).toEqual([reference]);
    });

    it('fails closed for malformed records and references from another connection', () => {
        expect(readRemoteFileSourceReferences([
            { path: reference.path },
            { __dataHubRemoteFile: { ...reference, size: '128' } },
            createRemoteFileSourceRecord(reference),
        ], 'other-sftp')).toEqual([]);
    });

    it('distinguishes normal extraction from an empty source-reference run', () => {
        expect(readRemoteFileSourceReferences(undefined)).toBeUndefined();
        expect(readRemoteFileSourceReferences([])).toEqual([]);
    });
});
