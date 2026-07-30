import { describe, expect, it } from 'vitest';
import { DEFAULT_STEP_CONFIGS } from '../../constants';
import {
    buildStepConfigRecord,
    normalizeConfigOptions,
    normalizeStringMap,
} from './config-options-normalization';
import type {
    RawConfigOptionsData,
    StepTypeConfig,
} from './config-options.types';

function createRawConfigOptions(
    overrides: Partial<RawConfigOptionsData> = {},
): RawConfigOptionsData {
    return {
        stepTypes: [],
        loadStrategies: [],
        conflictStrategies: [],
        triggerTypes: [],
        fileEncodings: [],
        csvDelimiters: [],
        httpMethods: [],
        authTypes: [],
        destinationTypes: [],
        fileFormats: [],
        validationModes: [],
        validationStrictnesses: [],
        channelStrategies: [],
        queueTypes: [],
        vendureEvents: [],
        comparisonOperators: [],
        approvalTypes: [],
        backoffStrategies: [],
        enrichmentSourceTypes: [],
        validationRuleTypes: [],
        exportAdapterCodes: [],
        feedAdapterCodes: [],
        connectionSchemas: [],
        destinationSchemas: [],
        hookStages: [],
        hookStageCategories: [],
        logLevels: [],
        parallelErrorPolicies: [],
        logPersistenceLevels: [],
        adapterTypes: [],
        runStatuses: [],
        fieldTransformTypes: [],
        wizardStrategyMappings: [],
        queryTypeOptions: [],
        cronPresets: [],
        ackModes: [],
        ...overrides,
    };
}

const scheduleTrigger = {
    value: 'SCHEDULE',
    label: 'Schedule',
    fields: [],
    defaultValues: { enabled: true },
    configKeyMap: { schedule: 'cron' },
    wizardScopes: ['import'],
};

const malformedDefaultCases: Array<[string, unknown]> = [
    ['triggerTypes', {
        triggerTypes: [{ ...scheduleTrigger, defaultValues: [] }],
    }],
    ['approvalTypes', {
        approvalTypes: [{
            value: 'MANUAL',
            label: 'Manual',
            fields: [],
            defaultValues: 'invalid',
        }],
    }],
    ['enrichmentSourceTypes', {
        enrichmentSourceTypes: [{
            value: 'HTTP',
            label: 'HTTP',
            fields: [],
            defaultValues: 42,
        }],
    }],
    ['validationRuleTypes', {
        validationRuleTypes: [{
            value: 'REQUIRED',
            label: 'Required',
            fields: [],
            defaultValues: false,
        }],
    }],
];

describe('config option normalization', () => {
    it('normalizes JSON object contracts and nullable adapter types', () => {
        const data = normalizeConfigOptions(createRawConfigOptions({
            stepTypes: [{
                type: 'EXTRACT',
                label: 'Extract',
                description: 'Extract records',
                icon: 'Database',
                color: '#fff',
                bgColor: '#000',
                borderColor: '#ccc',
                inputs: 0,
                outputs: 1,
                category: 'source',
                adapterType: null,
                nodeType: 'source',
            }],
            triggerTypes: [scheduleTrigger],
            approvalTypes: [{
                value: 'MANUAL',
                label: 'Manual',
                fields: [],
                defaultValues: { timeoutSeconds: 60 },
            }],
            destinationSchemas: [{
                type: 'SFTP',
                label: 'SFTP',
                configKey: 'sftpConfig',
                fields: [],
                fieldMapping: { directory: 'path' },
            }],
        }));

        expect(data.triggerTypes[0].defaultValues).toEqual({ enabled: true });
        expect(data.triggerTypes[0].configKeyMap).toEqual({ schedule: 'cron' });
        expect(data.approvalTypes[0].defaultValues)
            .toEqual({ timeoutSeconds: 60 });
        expect(data.destinationSchemas[0].fieldMapping)
            .toEqual({ directory: 'path' });
        expect(data.stepTypes[0].adapterType).toBeNull();
    });

    it.each(malformedDefaultCases)(
        'rejects malformed %s default values at the query boundary', (
        fieldName,
        overrides,
    ) => {
        expect(() => normalizeConfigOptions(createRawConfigOptions(
            overrides as Partial<RawConfigOptionsData>,
        )))
            .toThrow(`${fieldName}.`);
        },
    );

    it('rejects non-string mappings and safely preserves special keys', () => {
        expect(() => normalizeStringMap({ source: 1 }, 'fieldMapping'))
            .toThrow('fieldMapping.source must be a string');

        const input = Object.fromEntries([['__proto__', 'path']]);
        const normalized = normalizeStringMap(input, 'fieldMapping');
        expect(normalized).toHaveProperty('__proto__', 'path');
        expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype);
    });
});

describe('step config normalization', () => {
    it('isolates fallbacks and overrides only supported step types', () => {
        const extract: StepTypeConfig = {
            type: 'EXTRACT',
            label: 'Backend extract',
            description: 'Backend description',
            icon: 'Database',
            color: '#123456',
            bgColor: '#abcdef',
            borderColor: '#fedcba',
            inputs: 0,
            outputs: 1,
            category: 'source',
            adapterType: 'EXTRACTOR',
            nodeType: 'source',
        };
        const unknown = { ...extract, type: 'UNKNOWN' };

        const first = buildStepConfigRecord([extract, unknown]);
        const second = buildStepConfigRecord(undefined);

        expect(first.EXTRACT.label).toBe('Backend extract');
        expect(first).not.toHaveProperty('UNKNOWN');
        expect(second.EXTRACT).toEqual(DEFAULT_STEP_CONFIGS.EXTRACT);
        expect(second).not.toBe(DEFAULT_STEP_CONFIGS);
        expect(second.EXTRACT).not.toBe(DEFAULT_STEP_CONFIGS.EXTRACT);
    });
});
