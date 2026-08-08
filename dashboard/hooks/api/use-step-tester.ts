import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import type {
    SimulateDataHubLoadApiMutation,
    SimulateDataHubTransformApiMutation,
    SimulateDataHubValidateApiMutation,
} from '../../gql/graphql';

/** Record type used in step testing */
type TestRecord = Record<string, unknown>;

const previewExtractDocument = graphql(`
    mutation PreviewDataHubExtractApi($step: JSON!, $limit: Int) {
        previewDataHubExtract(step: $step, limit: $limit) { records }
    }
`);

const simulateTransformDocument = graphql(`
    mutation SimulateDataHubTransformApi($step: JSON!, $records: [JSON!]!) {
        simulateDataHubTransform(step: $step, records: $records)
    }
`);

const simulateLoadDocument = graphql(`
    mutation SimulateDataHubLoadApi($step: JSON!, $records: [JSON!]!) {
        simulateDataHubLoad(step: $step, records: $records)
    }
`);

const simulateValidateDocument = graphql(`
    mutation SimulateDataHubValidateApi($step: JSON!, $records: [JSON!]!) {
        simulateDataHubValidate(step: $step, records: $records) {
            records
            summary { input passed failed passRate }
        }
    }
`);

export async function previewExtract(step: TestRecord, limit: number): Promise<TestRecord[]> {
    const res = await api.mutate(previewExtractDocument, { step, limit });
    return (res?.previewDataHubExtract?.records ?? []) as TestRecord[];
}

export async function simulateTransform(step: TestRecord, records: TestRecord[]): Promise<TestRecord[]> {
    const res = await api.mutate(simulateTransformDocument, { step, records }) as SimulateDataHubTransformApiMutation;
    return res.simulateDataHubTransform;
}

export async function simulateLoad(step: TestRecord, records: TestRecord[]): Promise<TestRecord> {
    const res = await api.mutate(simulateLoadDocument, { step, records }) as SimulateDataHubLoadApiMutation;
    return res.simulateDataHubLoad;
}

export async function simulateValidate(step: TestRecord, records: TestRecord[]) {
    const res = await api.mutate(simulateValidateDocument, { step, records }) as SimulateDataHubValidateApiMutation;
    return res.simulateDataHubValidate;
}
