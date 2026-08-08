import { describe, expect, it } from 'vitest';
import { DIFF_TYPE } from '../../../constants';
import { buildRecordChanges } from './dry-run-record-changes';

describe('buildRecordChanges', () => {
    it('classifies added, removed, changed, and unchanged values', () => {
        expect(buildRecordChanges(
            { removed: 1, changed: 'before', stable: true },
            { added: 2, changed: 'after', stable: true },
        )).toEqual([
            { key: 'added', type: DIFF_TYPE.ADDED, newValue: 2 },
            {
                key: 'changed',
                type: DIFF_TYPE.CHANGED,
                oldValue: 'before',
                newValue: 'after',
            },
            { key: 'removed', type: DIFF_TYPE.REMOVED, oldValue: 1 },
            {
                key: 'stable',
                type: DIFF_TYPE.UNCHANGED,
                oldValue: true,
                newValue: true,
            },
        ]);
    });

    it('preserves the existing JSON comparison behavior for nested values', () => {
        expect(buildRecordChanges(
            { nested: { value: 1 } },
            { nested: { value: 1 } },
        )).toEqual([
            {
                key: 'nested',
                type: DIFF_TYPE.UNCHANGED,
                oldValue: { value: 1 },
                newValue: { value: 1 },
            },
        ]);
    });
});
