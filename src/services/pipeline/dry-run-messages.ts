import {
    DryRunMessageCode,
    DryRunMessageLevel,
} from '../../constants';
import type {
    DryRunMessage,
    DryRunRecordError,
    PipelineDefinition,
    PipelineMetrics,
} from '../../types';
import { getAdapterCode } from '../../types/step-configs';

export function buildDryRunMessages(
    definition: PipelineDefinition,
    metrics: PipelineMetrics,
    errors: readonly DryRunRecordError[] = [],
): DryRunMessage[] {
    const totalRecords = typeof metrics.totalRecords === 'number'
        ? metrics.totalRecords
        : 0;
    const messages: DryRunMessage[] = [];

    if (totalRecords === 0) {
        messages.push({
            level: DryRunMessageLevel.WARNING,
            code: DryRunMessageCode.NO_RECORDS,
        });
        const extractStep = definition.steps.find(step => step.type === 'EXTRACT');
        if (extractStep) {
            messages.push({
                level: DryRunMessageLevel.INFO,
                code: DryRunMessageCode.EXTRACT_ADAPTER,
                stepKey: extractStep.key,
                values: { adapterCode: getAdapterCode(extractStep) ?? 'unknown' },
            });
        }
    } else {
        messages.push({
            level: DryRunMessageLevel.INFO,
            code: DryRunMessageCode.COMPLETED,
        });
        messages.push({
            level: DryRunMessageLevel.INFO,
            code: DryRunMessageCode.PROCESSED_RECORDS,
            values: { count: totalRecords },
        });
    }

    messages.push(...errors.map(error => ({
        level: DryRunMessageLevel.ERROR,
        code: DryRunMessageCode.RECORD_ERROR,
        detail: error.message,
        stepKey: error.stepKey,
    } satisfies DryRunMessage)));

    const details = Array.isArray(metrics.details) ? metrics.details : [];
    for (const detail of details) {
        if (
            !detail
            || typeof detail !== 'object'
            || Array.isArray(detail)
            || detail['simulation'] !== 'SKIPPED'
        ) {
            continue;
        }
        const stepKey = typeof detail['stepKey'] === 'string'
            ? detail['stepKey']
            : 'unknown';
        const stepType = typeof detail['stepType'] === 'string'
            ? detail['stepType']
            : 'step';
        messages.push({
            level: DryRunMessageLevel.WARNING,
            code: DryRunMessageCode.STEP_SIMULATION_SKIPPED,
            stepKey,
            values: { stepType },
        });
    }

    return messages;
}
