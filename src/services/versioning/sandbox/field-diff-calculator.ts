import { FieldDiff, FieldChange, RecordSample } from '../sandbox.service';
import { FieldDiffChangeType, RecordOutcome } from '../../../constants/enums';

/**
 * Helper for computing field-level diffs between records
 */
export class FieldDiffCalculator {
    /**
     * Compute field-level diffs between two records
     */
    computeFieldDiffs(before: Record<string, unknown>, after: Record<string, unknown>): FieldDiff[] {
        const diffs: FieldDiff[] = [];
        const allFields = new Set([...Object.keys(before), ...Object.keys(after)]);

        for (const field of allFields) {
            const diff = this.computeFieldDiff(field, before, after);
            if (diff) {
                diffs.push(diff);
            }
        }

        return diffs;
    }

    /**
     * Compute diff for a single field
     */
    private computeFieldDiff(
        field: string,
        before: Record<string, unknown>,
        after: Record<string, unknown>,
    ): FieldDiff | null {
        const beforeValue = before[field];
        const afterValue = after[field];
        const beforeType = beforeValue === null ? 'null' : typeof beforeValue;
        const afterType = afterValue === null ? 'null' : typeof afterValue;

        const changeType = this.determineChangeType(field, before, after, beforeValue, afterValue);

        if (changeType === FieldDiffChangeType.UNCHANGED) {
            return null;
        }

        return { field, changeType, beforeValue, afterValue, beforeType, afterType };
    }

    /**
     * Determine the type of change for a field
     */
    private determineChangeType(
        field: string,
        before: Record<string, unknown>,
        after: Record<string, unknown>,
        beforeValue: unknown,
        afterValue: unknown,
    ): FieldDiffChangeType {
        if (!(field in before) && field in after) {
            return FieldDiffChangeType.ADDED;
        }
        if (field in before && !(field in after)) {
            return FieldDiffChangeType.REMOVED;
        }
        if (!this.deepEquals(beforeValue, afterValue)) {
            return FieldDiffChangeType.MODIFIED;
        }
        return FieldDiffChangeType.UNCHANGED;
    }

    /**
     * Aggregate field changes across all samples
     */
    aggregateFieldChanges(samples: RecordSample[]): FieldChange[] {
        const fieldMap = new Map<string, AggregatedFieldData>();

        for (const sample of samples) {
            this.aggregateSampleDiffs(fieldMap, sample);
        }

        return this.buildFieldChanges(fieldMap, samples.length);
    }

    /**
     * Aggregate diffs from a single sample into the field map
     */
    private aggregateSampleDiffs(fieldMap: Map<string, AggregatedFieldData>, sample: RecordSample): void {
        for (const diff of sample.fieldDiffs) {
            const existing = fieldMap.get(diff.field);
            if (existing) {
                existing.count++;
                if (existing.sampleBefore.length < 3) {
                    existing.sampleBefore.push(diff.beforeValue);
                    existing.sampleAfter.push(diff.afterValue);
                }
            } else {
                fieldMap.set(diff.field, {
                    changeType: this.mapDiffChangeType(diff.changeType),
                    count: 1,
                    sampleBefore: [diff.beforeValue],
                    sampleAfter: [diff.afterValue],
                });
            }
        }
    }

    /**
     * Map diff change type to field change type
     */
    private mapDiffChangeType(changeType: FieldDiffChangeType): FieldDiffChangeType {
        switch (changeType) {
            case FieldDiffChangeType.ADDED: return FieldDiffChangeType.ADDED;
            case FieldDiffChangeType.REMOVED: return FieldDiffChangeType.REMOVED;
            default: return FieldDiffChangeType.MODIFIED;
        }
    }

    /**
     * Build FieldChange array from aggregated data
     */
    private buildFieldChanges(fieldMap: Map<string, AggregatedFieldData>, totalRecords: number): FieldChange[] {
        return Array.from(fieldMap.entries()).map(([field, data]) => ({
            field,
            changeType: data.changeType,
            affectedCount: data.count,
            totalRecords,
            percentage: Math.round((data.count / totalRecords) * 100),
            sampleBefore: data.sampleBefore,
            sampleAfter: data.sampleAfter,
        }));
    }

    /**
     * Determine the outcome of a transformation
     */
    determineOutcome(
        before: Record<string, unknown>,
        after: Record<string, unknown>,
        diffs: FieldDiff[],
    ): RecordOutcome {
        if (Object.keys(after).length === 0 && Object.keys(before).length > 0) {
            return RecordOutcome.FILTERED;
        }
        if (diffs.length === 0) {
            return RecordOutcome.UNCHANGED;
        }
        return RecordOutcome.SUCCESS;
    }

    /**
     * Deep equality check
     */
    private deepEquals(a: unknown, b: unknown): boolean {
        if (a === b) return true;
        if (typeof a !== typeof b) return false;
        if (a === null || b === null) return a === b;
        if (typeof a !== 'object') return a === b;

        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            return a.every((item, idx) => this.deepEquals(item, b[idx]));
        }

        if (Array.isArray(a) !== Array.isArray(b)) return false;

        const aObj = a as Record<string, unknown>;
        const bObj = b as Record<string, unknown>;
        const aKeys = Object.keys(aObj);
        const bKeys = Object.keys(bObj);

        if (aKeys.length !== bKeys.length) return false;
        return aKeys.every(key => this.deepEquals(aObj[key], bObj[key]));
    }
}

/**
 * Internal type for aggregating field data
 */
interface AggregatedFieldData {
    changeType: FieldChange['changeType'];
    count: number;
    sampleBefore: unknown[];
    sampleAfter: unknown[];
}
