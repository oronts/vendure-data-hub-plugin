import type { RequestContext } from '@vendure/core';
import { SCHEMA_REGISTRY } from '../../constants';
import type { DataHubLogger } from '../../services/logger';
import { formatSchemaValidationIssues } from '../../services/schema/schema-definition';
import type { SchemaRegistryService } from '../../services/schema/schema-registry.service';
import type {
    ExtractorPreviewResult,
    PipelineStepDefinition,
} from '../../types';
import type { OnRecordErrorCallback, RecordObject } from '../executor-types';

export function normalizeExtractPreview(
    result: ExtractorPreviewResult,
    limit: number,
): ExtractorPreviewResult {
    const error = result.metadata?.error;
    if (typeof error === 'string' && error.trim()) {
        throw new Error(error);
    }
    return {
        ...result,
        records: result.records.slice(0, limit),
    };
}

export async function validateExtractPreviewSchema(
    ctx: RequestContext,
    step: PipelineStepDefinition,
    result: ExtractorPreviewResult,
    schemaRegistry?: SchemaRegistryService,
): Promise<ExtractorPreviewResult> {
    if (!step.schemaRef) {
        return result;
    }
    if (!schemaRegistry) {
        throw new Error('Schema registry is unavailable for extract preview');
    }

    const validation = await schemaRegistry.validateRecords(
        ctx,
        step.schemaRef,
        result.records.map(record => record.data as RecordObject),
    );
    const invalid = validation.records.filter(item => item.issues.length > 0);
    if (invalid.length === 0) {
        return result;
    }

    const messages = invalid
        .flatMap(item => item.issues.map(issue => `${issue.path} ${issue.message}`))
        .slice(0, SCHEMA_REGISTRY.MAX_VALIDATION_ISSUES_PER_RECORD);
    if (validation.schema.compatibility !== 'PERMISSIVE') {
        throw new Error(
            `Schema ${validation.schema.schemaId}@${validation.schema.version} rejected preview records: ${messages.join('; ')}`,
        );
    }

    return {
        ...result,
        metadata: {
            ...result.metadata,
            schemaWarnings: messages,
        },
    };
}

export async function validateExtractedRecordSchema(
    ctx: RequestContext,
    step: PipelineStepDefinition,
    records: RecordObject[],
    schemaRegistry: SchemaRegistryService | undefined,
    logger: DataHubLogger,
    onRecordError?: OnRecordErrorCallback,
): Promise<RecordObject[]> {
    if (!step.schemaRef) {
        return records;
    }
    if (!schemaRegistry) {
        throw new Error('Schema registry is unavailable for extract step');
    }

    const validation = await schemaRegistry.validateRecords(
        ctx,
        step.schemaRef,
        records,
    );
    const invalid = validation.records.filter(item => item.issues.length > 0);
    if (validation.schema.compatibility === 'PERMISSIVE') {
        if (invalid.length > 0) {
            logger.warn('Permissive schema validation accepted mismatched records', {
                stepKey: step.key,
                schemaId: validation.schema.schemaId,
                schemaVersion: validation.schema.version,
                recordCount: invalid.length,
            });
        }
        return records;
    }
    if (invalid.length > 0 && !onRecordError) {
        throw new Error(
            `Schema ${validation.schema.schemaId}@${validation.schema.version}: ${formatSchemaValidationIssues(invalid[0].issues)}`,
        );
    }

    const accepted: RecordObject[] = [];
    for (const item of validation.records) {
        if (item.issues.length === 0) {
            accepted.push(item.record);
            continue;
        }
        await onRecordError?.(
            step.key,
            `Schema ${validation.schema.schemaId}@${validation.schema.version}: ${formatSchemaValidationIssues(item.issues)}`,
            item.record,
        );
    }
    return accepted;
}
