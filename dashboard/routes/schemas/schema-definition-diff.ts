export type SchemaDefinitionChangeType = 'ADDED' | 'REMOVED' | 'MODIFIED';

export interface SchemaDefinitionChange {
    readonly path: string;
    readonly type: SchemaDefinitionChangeType;
    readonly before?: unknown;
    readonly after?: unknown;
}

export function compareSchemaDefinitions(
    before: unknown,
    after: unknown,
): SchemaDefinitionChange[] {
    const changes: SchemaDefinitionChange[] = [];
    compareValue(before, after, '', changes);
    return changes;
}

function compareValue(
    before: unknown,
    after: unknown,
    path: string,
    changes: SchemaDefinitionChange[],
): void {
    if (valuesEqual(before, after)) return;

    if (isRecord(before) && isRecord(after)) {
        const keys = [...new Set([
            ...Object.keys(before),
            ...Object.keys(after),
        ])].sort();
        for (const key of keys) {
            const childPath = `${path}/${escapeJsonPointerSegment(key)}`;
            if (!(key in before)) {
                changes.push({ path: childPath, type: 'ADDED', after: after[key] });
            } else if (!(key in after)) {
                changes.push({ path: childPath, type: 'REMOVED', before: before[key] });
            } else {
                compareValue(before[key], after[key], childPath, changes);
            }
        }
        return;
    }

    changes.push({
        path: path || '/',
        type: 'MODIFIED',
        before,
        after,
    });
}

function valuesEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true;
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length
            && left.every((value, index) => valuesEqual(value, right[index]));
    }
    return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null
        && typeof value === 'object'
        && !Array.isArray(value);
}

function escapeJsonPointerSegment(segment: string): string {
    return segment.split('~').join('~0').split('/').join('~1');
}
