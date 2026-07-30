import { RecordLineage, RecordState, SandboxOptions } from '../sandbox.service';
import {
    LineageOutcome,
    RecordProcessingState,
} from '../../../constants/enums';

/** Maximum serialized JSON length before replacing with a summary */
const MAX_SERIALIZATION_LENGTH = 10_000;

/**
 * Helper for tracking data lineage through pipeline execution
 */
export class DataLineageTracker {
    private readonly lineageMap = new Map<number, RecordLineage>();
    private readonly enabled: boolean;
    private readonly maxRecords: number;

    constructor(options: Required<SandboxOptions>) {
        this.enabled = options.includeLineage;
        this.maxRecords = options.maxRecords;
    }

    /**
     * Initialize lineage tracking for a set of records
     */
    initialize(records: Record<string, unknown>[]): void {
        if (!this.enabled) return;

        records.slice(0, this.maxRecords).forEach((rec, idx) => {
            const recordId = this.extractRecordId(rec);
            this.lineageMap.set(idx, {
                recordIndex: idx,
                originalRecordId: recordId,
                finalRecordId: recordId,
                finalOutcome: LineageOutcome.LOADED,
                states: [],
            });
        });
    }

    /**
     * Track state for a record at a step
     */
    trackState(
        stepKey: string,
        stepType: string,
        recordIndex: number,
        state: RecordState['state'],
        data: Record<string, unknown>,
        notes?: string,
    ): void {
        if (!this.enabled) return;

        const lineage = this.lineageMap.get(recordIndex);
        if (lineage) {
            lineage.states.push({
                stepKey,
                stepType,
                state,
                data: this.cloneForLineage(data),
                timestamp: Date.now(),
                notes,
            });
            this.updateFinalState(lineage, state, data);
        }
    }

    setFinalOutcome(
        recordIndex: number,
        outcome: LineageOutcome,
        data?: Record<string, unknown>,
    ): void {
        if (!this.enabled) return;

        const lineage = this.lineageMap.get(recordIndex);
        if (!lineage) return;

        lineage.finalOutcome = outcome;
        if (data) {
            lineage.finalRecordId = this.extractRecordId(data);
        }
    }

    /**
     * Get all lineage records
     */
    getLineageRecords(): RecordLineage[] {
        return Array.from(this.lineageMap.values());
    }

    resolveRecordIndex(
        record: Record<string, unknown>,
        fallbackIndex: number,
    ): number {
        if (!this.enabled) return fallbackIndex;

        const recordId = this.extractRecordId(record);
        if (recordId === null) return fallbackIndex;

        for (const [index, lineage] of this.lineageMap) {
            if (
                lineage.finalRecordId === recordId
                || lineage.originalRecordId === recordId
            ) {
                return index;
            }
        }
        return fallbackIndex;
    }

    /**
     * Check if lineage tracking is enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Extract record ID from common fields
     */
    extractRecordId(record: Record<string, unknown>): string | null {
        const idFields = ['id', '_id', 'ID', 'Id', 'sku', 'code', 'uuid', 'externalId'];
        for (const field of idFields) {
            if (record[field] != null) {
                return String(record[field]);
            }
        }
        return null;
    }

    private updateFinalState(
        lineage: RecordLineage,
        state: RecordState['state'],
        data: Record<string, unknown>,
    ): void {
        const recordId = this.extractRecordId(data);
        if (recordId !== null) {
            lineage.finalRecordId = recordId;
        }

        if (state === RecordProcessingState.ERROR) {
            lineage.finalOutcome = LineageOutcome.ERROR;
        } else if (state === RecordProcessingState.FILTERED) {
            lineage.finalOutcome = LineageOutcome.FILTERED;
        } else if (state === RecordProcessingState.TRANSFORMED) {
            lineage.finalOutcome = LineageOutcome.LOADED;
        }
    }

    /**
     * Clone a record for lineage (limit depth to avoid huge objects)
     */
    private cloneForLineage(data: Record<string, unknown>): Record<string, unknown> {
        try {
            const str = JSON.stringify(data);
            if (str.length > MAX_SERIALIZATION_LENGTH) {
                return { _summary: `Object with ${Object.keys(data).length} keys (${str.length} chars)` };
            }
            return JSON.parse(str);
        } catch {
            return { _error: 'Could not serialize' };
        }
    }
}
