import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import type { JsonObject } from '../../types';

/** Record type used in step testing */
type TestRecord = JsonObject;

const previewExtractDocument = graphql(`
    mutation PreviewDataHubExtractApi($step: JSON!, $limit: Int) {
        previewDataHubExtract(step: $step, limit: $limit) { records }
    }
`);

const simulateTransformDocument = graphql(`
    mutation SimulateDataHubTransformApi($step: JSON!, $records: JSON!) {
        simulateDataHubTransform(step: $step, records: $records)
    }
`);

const simulateLoadDocument = graphql(`
    mutation SimulateDataHubLoadApi($step: JSON!, $records: JSON!) {
        simulateDataHubLoad(step: $step, records: $records)
    }
`);

const simulateValidateDocument = graphql(`
    mutation SimulateDataHubValidateApi($step: JSON!, $records: JSON!) {
        simulateDataHubValidate(step: $step, records: $records) {
            records
            summary { input passed failed passRate }
        }
    }
`);

const previewFeedDocument = graphql(`
    mutation PreviewDataHubFeedApi($feedCode: String!, $limit: Int) {
        previewDataHubFeed(feedCode: $feedCode, limit: $limit) { content contentType itemCount }
    }
`);

interface PreviewExtractInput {
    step: JsonObject;
    limit: number;
}

interface SimulateStepInput {
    step: JsonObject;
    records: TestRecord[];
}

interface PreviewFeedInput {
    feedCode: string;
    limit: number;
}

export async function previewExtract(step: JsonObject, limit: number): Promise<TestRecord[]> {
    const res = await api.mutate(previewExtractDocument, { step, limit });
    return (res?.previewDataHubExtract?.records ?? []) as TestRecord[];
}

export async function simulateTransform(step: JsonObject, records: TestRecord[]): Promise<TestRecord[]> {
    const res = await api.mutate(simulateTransformDocument, { step, records });
    return (res?.simulateDataHubTransform ?? []) as TestRecord[];
}

export async function simulateLoad(step: JsonObject, records: TestRecord[]): Promise<JsonObject> {
    const res = await api.mutate(simulateLoadDocument, { step, records });
    return (res?.simulateDataHubLoad ?? {}) as JsonObject;
}

export async function simulateValidate(step: JsonObject, records: TestRecord[]) {
    const res = await api.mutate(simulateValidateDocument, { step, records });
    return res?.simulateDataHubValidate;
}

export async function previewFeed(feedCode: string, limit: number) {
    const res = await api.mutate(previewFeedDocument, { feedCode, limit });
    return res?.previewDataHubFeed;
}
