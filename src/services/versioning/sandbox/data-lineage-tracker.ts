import { RecordLineage, RecordState, SandboxOptions } from '../sandbox.service';
import { LineageOutcome, RecordProcessingState } from '../../../constants/enums';

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
            this.lineageMap.set(idx, {
                recordIndex: idx,
                originalRecordId: this.extractRecordId(rec),
                finalRecordId: null,
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
        }
    }

    /**
     * Get all lineage records
     */
    getLineageRecords(): RecordLineage[] {
        return Array.from(this.lineageMap.values());
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

    /**
     * Clone a record for lineage (limit depth to avoid huge objects)
     */
    private cloneForLineage(data: Record<string, unknown>): Record<string, unknown> {
        try {
            const str = JSON.stringify(data);
            if (str.length > 10000) {
                return { _summary: `Object with ${Object.keys(data).length} keys (${str.length} chars)` };
            }
            return JSON.parse(str);
        } catch {
            return { _error: 'Could not serialize' };
        }
    }
}
