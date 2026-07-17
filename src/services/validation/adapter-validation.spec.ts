import { describe, expect, it } from 'vitest';
import type { AdapterDefinition, StepConfigSchemaField } from '../../sdk/types';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import {
    validateAdapterFields,
    validateExtractorConfigContract,
    validateSinkConfigContract,
} from './adapter-validation';

function validate(
    fields: readonly StepConfigSchemaField[],
    config: Record<string, unknown>,
): PipelineDefinitionIssue[] {
    const adapter: AdapterDefinition = {
        type: 'EXTRACTOR',
        code: 'constraint-test',
        schema: { fields },
    };
    const issues: PipelineDefinitionIssue[] = [];
    validateAdapterFields('extract', config, adapter, issues);
    return issues;
}

function errorCodes(issues: PipelineDefinitionIssue[]): string[] {
    return issues.map(issue => issue.errorCode ?? '');
}

describe('validateAdapterFields constraints', () => {
    it('accepts inclusive numeric and string boundaries, including zero', () => {
        const issues = validate([
            { key: 'quantity', type: 'number', validation: { min: 0, max: 10 } },
            { key: 'code', type: 'string', validation: { minLength: 2, maxLength: 4 } },
        ], { quantity: 0, code: 'ab' });

        expect(issues).toEqual([]);
    });

    it('reports numeric and length constraint violations', () => {
        const belowAndShort = validate([
            { key: 'quantity', type: 'number', validation: { min: 0 } },
            { key: 'code', type: 'string', validation: { minLength: 2 } },
        ], { quantity: -1, code: 'a' });
        const aboveAndLong = validate([
            { key: 'quantity', type: 'number', validation: { max: 10 } },
            { key: 'code', type: 'string', validation: { maxLength: 4 } },
        ], { quantity: 11, code: 'abcde' });

        expect(errorCodes(belowAndShort)).toEqual(['field-below-minimum', 'field-too-short']);
        expect(errorCodes(aboveAndLong)).toEqual(['field-above-maximum', 'field-too-long']);
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
        'rejects non-finite numeric value %s without constraint noise',
        value => {
            const issues = validate([
                { key: 'quantity', type: 'number', validation: { min: 0, max: 10 } },
            ], { quantity: value });

            expect(errorCodes(issues)).toEqual(['invalid-field-type']);
        },
    );

    it('uses the custom pattern message on a safe pattern mismatch', () => {
        const issues = validate([
            {
                key: 'code',
                type: 'string',
                validation: { pattern: '^[a-z]+$', patternMessage: 'Use lowercase letters only' },
            },
        ], { code: 'ABC' });

        expect(errorCodes(issues)).toEqual(['field-pattern-mismatch']);
        expect(issues[0].message).toBe('Use lowercase letters only');
    });

    it.each(['[', '(a+)+$'])(
        'reports invalid or unsafe validation pattern %s without executing it',
        pattern => {
            const issues = validate([
                { key: 'code', type: 'string', validation: { pattern } },
            ], { code: 'aaaa' });

            expect(errorCodes(issues)).toEqual(['invalid-field-validation-pattern']);
        },
    );

    it('does not apply string constraints after a primitive type failure or to missing optional fields', () => {
        const wrongType = validate([
            { key: 'code', type: 'string', validation: { minLength: 3, pattern: '^[a-z]+$' } },
        ], { code: 12 });
        const absent = validate([
            { key: 'code', type: 'string', validation: { minLength: 3 } },
        ], {});

        expect(errorCodes(wrongType)).toEqual(['invalid-field-type']);
        expect(absent).toEqual([]);
    });

    it('preserves select-option validation behavior', () => {
        const field: StepConfigSchemaField = {
            key: 'mode',
            type: 'select',
            options: [{ value: 'FAST', label: 'Fast' }],
        };

        expect(validate([field], { mode: 'fast' })).toEqual([]);
        expect(errorCodes(validate([field], { mode: 'slow' }))).toEqual(['invalid-select-option']);
    });

    it('resolves dotted schema fields from nested configuration', () => {
        const fields: readonly StepConfigSchemaField[] = [
            {
                key: 'pagination.limit',
                type: 'number',
                required: true,
                validation: { min: 1, max: 100 },
            },
        ];

        expect(validate(fields, { pagination: { limit: 50 } })).toEqual([]);
        expect(errorCodes(validate(fields, { pagination: { limit: 0 } }))).toEqual([
            'field-below-minimum',
        ]);
        expect(errorCodes(validate(fields, { 'pagination.limit': 50 }))).toEqual([
            'missing-required-field',
        ]);
    });
});

describe('validateExtractorConfigContract', () => {
    it('accepts the canonical nested HTTP contract', () => {
        const issues: PipelineDefinitionIssue[] = [];
        validateExtractorConfigContract('extract', 'httpApi', {
            adapterCode: 'httpApi',
            url: 'https://example.test',
            dataPath: 'data.items',
            pagination: { type: 'OFFSET', limit: 50 },
        }, issues);

        expect(issues).toEqual([]);
    });

    it.each([
        { adapterCode: 'httpApi', config: { itemsField: 'items' } },
        { adapterCode: 'graphql', config: { endpoint: 'https://example.test/graphql' } },
        { adapterCode: 'httpApi', config: { 'pagination.type': 'OFFSET' } },
        { adapterCode: 'graphql', config: { pagination: { type: 'relay' } } },
    ])('rejects non-canonical $adapterCode configuration', ({ adapterCode, config }) => {
        const issues: PipelineDefinitionIssue[] = [];
        validateExtractorConfigContract('extract', adapterCode, {
            adapterCode,
            ...config,
        }, issues);

        expect(errorCodes(issues)).toEqual(['invalid-extractor-config-contract']);
    });
});

describe('validateSinkConfigContract', () => {
    it('accepts the current built-in sink contract', () => {
        const issues: PipelineDefinitionIssue[] = [];

        validateSinkConfigContract('index', 'elasticsearch', {
            adapterCode: 'elasticsearch',
            node: 'https://search.example.test',
            batchSize: 100,
            usernameSecretCode: 'search-username',
            passwordSecretCode: 'search-password',
        }, issues);

        expect(issues).toEqual([]);
    });

    it.each([
        ['elasticsearch', { host: 'https://search.example.test' }, 'host'],
        ['algolia', { applicationId: 'legacy-app' }, 'applicationId'],
        ['meilisearch', { bulkSize: 100 }, 'bulkSize'],
        ['webhook', { basicSecretCode: 'legacy-basic' }, 'basicSecretCode'],
        ['typesense', { connectionCode: 'unused-connection' }, 'connectionCode'],
    ])('rejects removed %s sink configuration', (adapterCode, config, field) => {
        const issues: PipelineDefinitionIssue[] = [];

        validateSinkConfigContract('index', adapterCode, {
            adapterCode,
            ...config,
        }, issues);

        expect(issues).toEqual([expect.objectContaining({
            field,
            errorCode: 'unsupported-sink-field',
        })]);
    });

    it('retains connectionCode for queue producers and leaves custom sinks extensible', () => {
        const queueIssues: PipelineDefinitionIssue[] = [];
        const customIssues: PipelineDefinitionIssue[] = [];

        validateSinkConfigContract('queue', 'queueProducer', {
            adapterCode: 'queueProducer',
            connectionCode: 'orders-queue',
        }, queueIssues);
        validateSinkConfigContract('custom', 'custom-search', {
            adapterCode: 'custom-search',
            applicationId: 'custom-field',
        }, customIssues);

        expect(queueIssues).toEqual([]);
        expect(customIssues).toEqual([]);
    });
});
