import { DRY_RUN_MESSAGE_CODE } from '../../../../shared/constants';
import type { DataHubDryRunMessage } from '../../../gql/graphql';

export interface DryRunMessageFormatter {
    noRecords(): string;
    extractAdapter(adapterCode: string): string;
    completed(): string;
    processedRecords(count: number): string;
    recordError(stepKey: string, detail: string): string;
    stepSimulationSkipped(stepKey: string, stepType: string): string;
}

function stringValue(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function numberValue(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function formatDryRunMessage(
    message: DataHubDryRunMessage,
    formatter: DryRunMessageFormatter,
): string {
    const values = message.values ?? {};

    switch (message.code) {
        case DRY_RUN_MESSAGE_CODE.NO_RECORDS:
            return formatter.noRecords();
        case DRY_RUN_MESSAGE_CODE.EXTRACT_ADAPTER:
            return formatter.extractAdapter(stringValue(values.adapterCode, 'unknown'));
        case DRY_RUN_MESSAGE_CODE.COMPLETED:
            return formatter.completed();
        case DRY_RUN_MESSAGE_CODE.PROCESSED_RECORDS: {
            const count = numberValue(values.count);
            return formatter.processedRecords(count);
        }
        case DRY_RUN_MESSAGE_CODE.RECORD_ERROR:
            return formatter.recordError(
                message.stepKey ?? 'unknown',
                message.detail ?? message.code,
            );
        case DRY_RUN_MESSAGE_CODE.STEP_SIMULATION_SKIPPED:
            return formatter.stepSimulationSkipped(
                message.stepKey ?? 'unknown',
                stringValue(values.stepType, 'step'),
            );
        default:
            return message.detail ?? message.code;
    }
}
