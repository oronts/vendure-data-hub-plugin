/**
 * Entity breakdown collection utilities for impact analysis
 */
import {
    PipelineDefinition,
    EntityImpact,
    FieldChangePreview,
    SampleRecordFlow,
    StepTransformation,
} from '../../types/index';
import { IMPACT_ANALYSIS, StepType } from '../../constants/index';
import {
    VendureEntityType,
    FlowOutcome,
    SandboxLoadResultType,
} from '../../constants/enums';
import { getAdapterCode } from '../../types/step-configs';
import { trackFieldChanges } from './field-detection';
import { isEmpty } from '../../../shared/utils/validation';

/**
 * Internal collector type for aggregating entity impacts during analysis
 */
interface EntityBreakdownCollector {
    [entityType: string]: {
        operations: EntityOperations;
        fieldChanges: Map<string, FieldChangePreview>;
        sampleRecordIds: string[];
    };
}

/**
 * Entity operations count structure
 */
interface EntityOperations {
    create: number;
    update: number;
    delete: number;
    skip: number;
    error: number;
}

/**
 * Sample record structure from dry run
 */
export interface SampleRecord {
    step: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
}

/**
 * Collect entity breakdown from sample records
 */
export function collectEntityBreakdown(
    sampleRecords: SampleRecord[],
    definition: PipelineDefinition,
    _sampleSize: number,
): EntityImpact[] {
    const collector: EntityBreakdownCollector = {};
    const entityTypes = initializeEntityCollectors(definition, collector);

    for (const sample of sampleRecords) {
        processEntityRecord(sample, entityTypes, collector);
    }

    return Object.entries(collector).map(([entityType, data]) => ({
        entityType,
        operations: data.operations,
        fieldChanges: Array.from(data.fieldChanges.values()),
        sampleRecordIds: data.sampleRecordIds,
    }));
}

/**
 * Initialize entity collectors based on load steps in the pipeline definition
 */
function initializeEntityCollectors(
    definition: PipelineDefinition,
    collector: EntityBreakdownCollector,
): Set<string> {
    const loadSteps = getLoadSteps(definition);
    const entityTypes = new Set<string>();

    for (const step of loadSteps) {
        const adapterCode = getAdapterCode(step) || 'unknown';
        const entityType = inferEntityType(adapterCode);
        entityTypes.add(entityType);
    }

    for (const entityType of entityTypes) {
        collector[entityType] = {
            operations: { create: 0, update: 0, delete: 0, skip: 0, error: 0 },
            fieldChanges: new Map(),
            sampleRecordIds: [],
        };
    }

    return entityTypes;
}

/**
 * Process a single entity record and update the collector
 */
function processEntityRecord(
    sample: SampleRecord,
    entityTypes: Set<string>,
    collector: EntityBreakdownCollector,
): void {
    const entityType = inferEntityTypeFromSample(sample, entityTypes);

    if (!collector[entityType]) {
        collector[entityType] = {
            operations: { create: 0, update: 0, delete: 0, skip: 0, error: 0 },
            fieldChanges: new Map(),
            sampleRecordIds: [],
        };
    }

    const operation = inferOperation(sample);
    collector[entityType].operations[operation]++;

    const recordId = extractRecordId(sample.after);
    if (recordId && collector[entityType].sampleRecordIds.length < IMPACT_ANALYSIS.MAX_SAMPLE_RECORD_IDS) {
        collector[entityType].sampleRecordIds.push(recordId);
    }

    trackFieldChanges(sample, collector[entityType].fieldChanges);
}

/**
 * Generate sample flows from sample records
 */
export function generateSampleFlows(
    sampleRecords: SampleRecord[],
    definition: PipelineDefinition,
): SampleRecordFlow[] {
    // Group samples by a record identifier to show flow through pipeline
    const flows: Map<string, SampleRecordFlow> = new Map();

    for (const sample of sampleRecords) {
        const recordId = extractRecordId(sample.after) || `sample-${flows.size}`;

        let flow = flows.get(recordId);
        if (!flow) {
            flow = {
                recordId,
                sourceData: sample.before,
                steps: [],
                finalData: null,
                outcome: FlowOutcome.SUCCESS,
            };
            flows.set(recordId, flow);
        }

        const step = findStep(definition, sample.step);

        flow.steps.push({
            stepKey: sample.step,
            stepType: step?.type || 'unknown',
            stepName: step?.name || sample.step,
            input: sample.before,
            output: sample.after,
            durationMs: 0,
            notes: [],
            recordsIn: 1,
            recordsOut: 1,
        });

        flow.finalData = sample.after;
    }

    return Array.from(flows.values()).slice(0, IMPACT_ANALYSIS.MAX_SAMPLE_FLOWS);
}

/**
 * Generate step transformations from samples
 */
export function generateStepTransformations(
    stepSamples: SampleRecord[],
    stepKey: string,
    step: PipelineDefinition['steps'][number] | null,
): StepTransformation[] {
    return stepSamples.map((sample) => ({
        stepKey,
        stepType: step?.type || 'unknown',
        stepName: step?.name || stepKey,
        input: sample.before,
        output: sample.after,
        durationMs: 0,
        notes: [],
        recordsIn: 1,
        recordsOut: 1,
    }));
}

/**
 * Get load steps from pipeline definition
 */
function getLoadSteps(definition: PipelineDefinition): PipelineDefinition['steps'] {
    return (definition.steps || []).filter(s => s.type === StepType.LOAD);
}

/**
 * Find a step in the pipeline definition by key
 */
export function findStep(definition: PipelineDefinition, stepKey: string): PipelineDefinition['steps'][number] | null {
    return (definition.steps || []).find(s => s.key === stepKey) || null;
}

/**
 * Map adapter codes to entity types
 */
function inferEntityType(adapterCode: string): string {
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
 * Infer entity type from sample record structure
 */
function inferEntityTypeFromSample(
    sample: { step: string; after: Record<string, unknown> },
    entityTypes: Set<string>,
): string {
    // Try to infer from record structure
    if (sample.after.__typename) {
        return String(sample.after.__typename);
    }

    // Return first known entity type
    return entityTypes.values().next().value || 'Entity';
}

/**
 * Infer operation type from before/after states
 */
function inferOperation(
    sample: { before: Record<string, unknown>; after: Record<string, unknown> },
): SandboxLoadResultType {
    if (isEmpty(sample.before) && !isEmpty(sample.after)) {
        return SandboxLoadResultType.CREATE;
    }
    if (!isEmpty(sample.before) && isEmpty(sample.after)) {
        return SandboxLoadResultType.DELETE;
    }
    if (isEmpty(sample.before) && isEmpty(sample.after)) {
        return SandboxLoadResultType.SKIP;
    }
    return SandboxLoadResultType.UPDATE;
}

/**
 * Extract record ID from common ID fields
 */
function extractRecordId(record: Record<string, unknown>): string | null {
    const idFields = ['id', '_id', 'ID', 'Id', 'sku', 'code', 'uuid'];
    for (const field of idFields) {
        if (record[field] != null) {
            return String(record[field]);
        }
    }
    return null;
}
