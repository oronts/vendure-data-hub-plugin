import { useMutation } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createMutationErrorHandler } from './mutation-helpers';
import type { JsonObject } from '../../types';

/** Step configuration for testing */
export type StepConfig = JsonObject;

/** Record type used in step testing */
export type TestRecord = JsonObject;

export const stepTesterKeys = {
    all: ['stepTester'] as const,
    extract: () => [...stepTesterKeys.all, 'extract'] as const,
    transform: () => [...stepTesterKeys.all, 'transform'] as const,
    load: () => [...stepTesterKeys.all, 'load'] as const,
    validate: () => [...stepTesterKeys.all, 'validate'] as const,
    feed: () => [...stepTesterKeys.all, 'feed'] as const,
};

export const previewExtractDocument = graphql(`
    mutation PreviewDataHubExtractApi($step: JSON!, $limit: Int) {
        previewDataHubExtract(step: $step, limit: $limit) { records }
    }
`);

export const simulateTransformDocument = graphql(`
    mutation SimulateDataHubTransformApi($step: JSON!, $records: JSON!) {
        simulateDataHubTransform(step: $step, records: $records)
    }
`);

export const simulateLoadDocument = graphql(`
    mutation SimulateDataHubLoadApi($step: JSON!, $records: JSON!) {
        simulateDataHubLoad(step: $step, records: $records)
    }
`);

export const simulateValidateDocument = graphql(`
    mutation SimulateDataHubValidateApi($step: JSON!, $records: JSON!) {
        simulateDataHubValidate(step: $step, records: $records) {
            records
            summary { input passed failed passRate }
        }
    }
`);

export const previewFeedDocument = graphql(`
    mutation PreviewDataHubFeedApi($feedCode: String!, $limit: Int) {
        previewDataHubFeed(feedCode: $feedCode, limit: $limit) { content contentType itemCount }
    }
`);

export interface PreviewExtractInput {
    step: StepConfig;
    limit: number;
}

export interface SimulateStepInput {
    step: StepConfig;
    records: TestRecord[];
}

export interface PreviewFeedInput {
    feedCode: string;
    limit: number;
}

export function usePreviewExtract() {
    return useMutation({
        mutationFn: ({ step, limit }: PreviewExtractInput) =>
            api
                .mutate(previewExtractDocument, { step, limit })
                .then((res) => (res?.previewDataHubExtract?.records ?? []) as TestRecord[]),
        onError: createMutationErrorHandler('preview extract'),
    });
}

export function useSimulateTransform() {
    return useMutation({
        mutationFn: ({ step, records }: SimulateStepInput) =>
            api
                .mutate(simulateTransformDocument, { step, records })
                .then((res) => (res?.simulateDataHubTransform ?? []) as TestRecord[]),
        onError: createMutationErrorHandler('simulate transform'),
    });
}

export function useSimulateLoad() {
    return useMutation({
        mutationFn: ({ step, records }: SimulateStepInput) =>
            api
                .mutate(simulateLoadDocument, { step, records })
                .then((res) => (res?.simulateDataHubLoad ?? {}) as JsonObject),
        onError: createMutationErrorHandler('simulate load'),
    });
}

export function useSimulateValidate() {
    return useMutation({
        mutationFn: ({ step, records }: SimulateStepInput) =>
            api
                .mutate(simulateValidateDocument, { step, records })
                .then((res) => res?.simulateDataHubValidate),
        onError: createMutationErrorHandler('simulate validate'),
    });
}

export function usePreviewFeed() {
    return useMutation({
        mutationFn: ({ feedCode, limit }: PreviewFeedInput) =>
            api
                .mutate(previewFeedDocument, { feedCode, limit })
                .then((res) => res?.previewDataHubFeed),
        onError: createMutationErrorHandler('preview feed'),
    });
}

export async function previewExtract(step: StepConfig, limit: number): Promise<TestRecord[]> {
    const res = await api.mutate(previewExtractDocument, { step, limit });
    return (res?.previewDataHubExtract?.records ?? []) as TestRecord[];
}

export async function simulateTransform(step: StepConfig, records: TestRecord[]): Promise<TestRecord[]> {
    const res = await api.mutate(simulateTransformDocument, { step, records });
    return (res?.simulateDataHubTransform ?? []) as TestRecord[];
}

export async function simulateLoad(step: StepConfig, records: TestRecord[]): Promise<JsonObject> {
    const res = await api.mutate(simulateLoadDocument, { step, records });
    return (res?.simulateDataHubLoad ?? {}) as JsonObject;
}

export async function simulateValidate(step: StepConfig, records: TestRecord[]) {
    const res = await api.mutate(simulateValidateDocument, { step, records });
    return res?.simulateDataHubValidate;
}

export async function previewFeed(feedCode: string, limit: number) {
    const res = await api.mutate(previewFeedDocument, { feedCode, limit });
    return res?.previewDataHubFeed;
}
