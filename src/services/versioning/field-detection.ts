/**
 * Field change detection utilities for impact analysis
 */
import { FieldChangePreview } from '../../types/index';
import { IMPACT_ANALYSIS } from '../../constants/index';
import { ImpactFieldChangeType } from '../../constants/enums';

/**
 * Sample record structure for field detection
 */
interface FieldDetectionSample {
    step: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
}

/**
 * Detect field changes between before and after states of samples
 */
export function detectFieldChanges(
    samples: FieldDetectionSample[],
): FieldChangePreview[] {
    const fieldMap = new Map<string, FieldChangePreview>();

    for (const sample of samples) {
        const beforeFields = new Set(Object.keys(sample.before || {}));
        const afterFields = new Set(Object.keys(sample.after || {}));

        // Added fields
        for (const field of afterFields) {
            if (!beforeFields.has(field)) {
                updateFieldChange(fieldMap, field, ImpactFieldChangeType.SET, sample.before[field], sample.after[field]);
            }
        }

        // Removed fields
        for (const field of beforeFields) {
            if (!afterFields.has(field)) {
                updateFieldChange(fieldMap, field, ImpactFieldChangeType.REMOVE, sample.before[field], sample.after[field]);
            }
        }

        // Modified fields
        for (const field of afterFields) {
            if (beforeFields.has(field) && sample.before[field] !== sample.after[field]) {
                const changeType = isTransform(sample.before[field], sample.after[field])
                    ? ImpactFieldChangeType.TRANSFORM
                    : ImpactFieldChangeType.UPDATE;
                updateFieldChange(fieldMap, field, changeType, sample.before[field], sample.after[field]);
            }
        }
    }

    return Array.from(fieldMap.values());
}

/**
 * Update field change tracking map with new change data
 */
export function updateFieldChange(
    map: Map<string, FieldChangePreview>,
    field: string,
    changeType: ImpactFieldChangeType,
    before: unknown,
    after: unknown,
): void {
    let change = map.get(field);
    if (!change) {
        change = {
            field,
            changeType,
            affectedCount: 0,
            sampleBefore: [],
            sampleAfter: [],
        };
        map.set(field, change);
    }

    change.affectedCount++;
    if (change.sampleBefore.length < IMPACT_ANALYSIS.MAX_SAMPLE_FIELD_VALUES) {
        change.sampleBefore.push(before);
        change.sampleAfter.push(after);
    }
}

/**
 * Track field changes from a sample and merge into existing field changes map
 */
export function trackFieldChanges(
    sample: { before: Record<string, unknown>; after: Record<string, unknown> },
    fieldChanges: Map<string, FieldChangePreview>,
): void {
    const changes = detectFieldChanges([{ step: '', ...sample }]);
    for (const change of changes) {
        const existing = fieldChanges.get(change.field);
        if (existing) {
            existing.affectedCount += change.affectedCount;
        } else {
            fieldChanges.set(change.field, change);
        }
    }
}

/**
 * Determine if a value change represents a transformation (type or significant modification)
 */
export function isTransform(before: unknown, after: unknown): boolean {
    // Check if value was transformed (type changed or significant modification)
    return typeof before !== typeof after ||
        (typeof before === 'string' && typeof after === 'string' &&
            (after as string).length !== (before as string).length);
}
