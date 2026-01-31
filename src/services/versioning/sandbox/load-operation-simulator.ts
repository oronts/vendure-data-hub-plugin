import { RequestContext } from '@vendure/core';
import { PipelineStepDefinition } from '../../../types/index';
import { VendureEntityType, SandboxLoadResultType } from '../../../constants/enums';
import { getAdapterCode, getStepStrategy } from '../../../utils/step-utils';
import { FieldDiff, LoadOperationPreview, LoadOperationDetail, SandboxOptions } from '../sandbox.service';

/**
 * Helper for simulating load operations in sandbox mode
 */
export class LoadOperationSimulator {
    /**
     * Simulate load operations to preview what would happen
     */
    async simulateLoadOperations(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        records: Record<string, unknown>[],
        opts: Required<SandboxOptions>,
    ): Promise<LoadOperationPreview> {
        const adapterCode = getAdapterCode(step) ?? 'unknown';
        const entityType = this.inferEntityType(adapterCode);
        const preview = this.createEmptyPreview(entityType, adapterCode);

        await this.analyzeRecords(ctx, step, records, opts, preview, entityType);
        this.addWarnings(preview, records.length, opts.maxRecords);

        return preview;
    }

    /**
     * Create empty load operation preview
     */
    private createEmptyPreview(entityType: string, adapterCode: string): LoadOperationPreview {
        return {
            entityType,
            adapterCode,
            operations: { create: [], update: [], delete: [], skip: [], error: [] },
            summary: { createCount: 0, updateCount: 0, deleteCount: 0, skipCount: 0, errorCount: 0 },
            warnings: [],
        };
    }

    /**
     * Analyze records and populate preview
     */
    private async analyzeRecords(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        records: Record<string, unknown>[],
        opts: Required<SandboxOptions>,
        preview: LoadOperationPreview,
        entityType: string,
    ): Promise<void> {
        for (let i = 0; i < Math.min(records.length, opts.maxRecords); i++) {
            const record = records[i];
            const recordId = this.extractRecordId(record);
            const operation = this.determineLoadOperation(step, record, entityType);
            const detail = this.createOperationDetail(i, recordId, record, operation);

            this.addOperationToPreview(preview, operation.type, detail);
        }
    }

    /**
     * Create operation detail object
     */
    private createOperationDetail(
        index: number,
        recordId: string | null,
        record: Record<string, unknown>,
        operation: LoadOperationResult,
    ): LoadOperationDetail {
        return {
            recordIndex: index,
            recordId,
            entityId: operation.entityId,
            reason: operation.reason,
            data: record,
            existingData: operation.existingData,
            diff: operation.diff,
        };
    }

    /**
     * Add operation to preview and update summary
     */
    private addOperationToPreview(
        preview: LoadOperationPreview,
        type: LoadOperationResult['type'],
        detail: LoadOperationDetail,
    ): void {
        preview.operations[type].push(detail);
        preview.summary[`${type}Count` as keyof typeof preview.summary]++;
    }

    /**
     * Add warnings for common issues
     */
    private addWarnings(preview: LoadOperationPreview, totalRecords: number, maxRecords: number): void {
        if (preview.summary.deleteCount > 0) {
            preview.warnings.push(`${preview.summary.deleteCount} records will be deleted - this cannot be undone`);
        }
        if (preview.summary.errorCount > 0) {
            preview.warnings.push(`${preview.summary.errorCount} records have validation errors and will not be loaded`);
        }
        if (totalRecords > maxRecords) {
            preview.warnings.push(`Only ${maxRecords} of ${totalRecords} records were analyzed`);
        }
    }

    /**
     * Determine what load operation would be performed for a record
     */
    private determineLoadOperation(
        step: PipelineStepDefinition,
        record: Record<string, unknown>,
        entityType: string,
    ): LoadOperationResult {
        const recordId = this.extractRecordId(record);
        const strategy = getStepStrategy(step) ?? 'upsert';

        const missingFieldsError = this.checkRequiredFields(record, entityType);
        if (missingFieldsError) {
            return missingFieldsError;
        }

        return this.determineOperationType(recordId, strategy);
    }

    /**
     * Check for required fields and return error if missing
     */
    private checkRequiredFields(record: Record<string, unknown>, entityType: string): LoadOperationResult | null {
        const requiredFields = this.getRequiredFields(entityType);
        const missingFields = requiredFields.filter(f => record[f] == null);

        if (missingFields.length > 0) {
            return {
                type: SandboxLoadResultType.ERROR,
                entityId: null,
                reason: `Missing required fields: ${missingFields.join(', ')}`,
            };
        }
        return null;
    }

    /**
     * Determine operation type based on record ID and strategy
     */
    private determineOperationType(recordId: string | null, strategy: string): LoadOperationResult {
        if (recordId) {
            if (strategy === 'create-only') {
                return { type: SandboxLoadResultType.SKIP, entityId: recordId, reason: 'Record has ID but strategy is create-only' };
            }
            return { type: SandboxLoadResultType.UPDATE, entityId: recordId, reason: 'Record has existing ID', diff: [] };
        } else {
            if (strategy === 'update-only') {
                return { type: SandboxLoadResultType.SKIP, entityId: null, reason: 'Record has no ID but strategy is update-only' };
            }
            return { type: SandboxLoadResultType.CREATE, entityId: null, reason: 'New record' };
        }
    }

    /**
     * Extract record ID from common fields
     */
    private extractRecordId(record: Record<string, unknown>): string | null {
        const idFields = ['id', '_id', 'ID', 'Id', 'sku', 'code', 'uuid', 'externalId'];
        for (const field of idFields) {
            if (record[field] != null) {
                return String(record[field]);
            }
        }
        return null;
    }

    /**
     * Infer entity type from adapter code
     */
    private inferEntityType(adapterCode: string): string {
        const mapping: Record<string, string> = {
            'vendure-products': VendureEntityType.PRODUCT,
            'vendure-variants': VendureEntityType.PRODUCT_VARIANT,
            'vendure-customers': VendureEntityType.CUSTOMER,
            'vendure-orders': VendureEntityType.ORDER,
            'vendure-collections': VendureEntityType.COLLECTION,
            'vendure-facets': VendureEntityType.FACET,
            'vendure-assets': VendureEntityType.ASSET,
            'vendure-product-sync': VendureEntityType.PRODUCT,
        };
        return mapping[adapterCode] || 'Entity';
    }

    /**
     * Get required fields for an entity type
     */
    private getRequiredFields(entityType: string): string[] {
        const requirements: Record<string, string[]> = {
            [VendureEntityType.PRODUCT]: ['name'],
            [VendureEntityType.PRODUCT_VARIANT]: ['sku', 'productId'],
            [VendureEntityType.CUSTOMER]: ['emailAddress'],
            [VendureEntityType.COLLECTION]: ['name'],
            [VendureEntityType.FACET]: ['name', 'code'],
        };
        return requirements[entityType] || [];
    }
}

/**
 * Result of determining a load operation
 */
interface LoadOperationResult {
    type: SandboxLoadResultType;
    entityId: string | null;
    reason: string;
    existingData?: Record<string, unknown>;
    diff?: FieldDiff[];
}
