import { DIFF_TYPE } from '../../../constants';

type DiffType = typeof DIFF_TYPE[keyof typeof DIFF_TYPE];

export interface RecordChange {
    key: string;
    type: DiffType;
    oldValue?: unknown;
    newValue?: unknown;
}

export function buildRecordChanges(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
): RecordChange[] {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    return keys.map(key => buildRecordChange(key, before, after));
}

function buildRecordChange(
    key: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
): RecordChange {
    const hasOld = Object.prototype.hasOwnProperty.call(before, key);
    const hasNew = Object.prototype.hasOwnProperty.call(after, key);
    const oldValue = before[key];
    const newValue = after[key];

    if (!hasOld) return { key, type: DIFF_TYPE.ADDED, newValue };
    if (!hasNew) return { key, type: DIFF_TYPE.REMOVED, oldValue };
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        return { key, type: DIFF_TYPE.CHANGED, oldValue, newValue };
    }
    return { key, type: DIFF_TYPE.UNCHANGED, oldValue, newValue };
}
