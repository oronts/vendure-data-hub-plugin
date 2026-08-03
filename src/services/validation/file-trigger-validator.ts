import { StepType } from '../../constants/enums';
import { FILE_WATCH } from '../../constants/defaults';
import type { PipelineDefinition } from '../../types';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import {
    addTriggerIssue,
    asConfigRecord,
    rejectUnsupportedTriggerFields,
    type TriggerConfigRecord,
} from './trigger-validation-utils';

const SUPPORTED_FILE_EXTRACTORS = new Set(['ftp', 's3']);

export function validateFileTrigger(
    stepKey: string,
    config: TriggerConfigRecord,
    definition: PipelineDefinition,
    issues: PipelineDefinitionIssue[],
): void {
    const fileWatch = asConfigRecord(config.fileWatch);
    if (!fileWatch) {
        addTriggerIssue(
            issues,
            stepKey,
            'file trigger requires a fileWatch configuration object',
            'missing-file-watch-config',
        );
        return;
    }

    rejectUnsupportedTriggerFields(
        fileWatch,
        ['events', 'debounceMs'],
        stepKey,
        'file',
        issues,
    );
    validateRequiredString(fileWatch, 'connectionCode', stepKey, issues);
    validateRequiredString(fileWatch, 'path', stepKey, issues);
    validateOptionalString(fileWatch, 'pattern', stepKey, issues);
    validateOptionalBoolean(fileWatch, 'recursive', stepKey, issues);
    validatePollInterval(fileWatch, stepKey, issues);
    validateMinFileAge(fileWatch, stepKey, issues);
    validateConnectedExtractor(definition, stepKey, issues);
}

function validateRequiredString(
    config: TriggerConfigRecord,
    field: 'connectionCode' | 'path',
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const value = config[field];
    if (typeof value === 'string' && value.trim().length > 0) return;
    addTriggerIssue(
        issues,
        stepKey,
        field === 'connectionCode'
            ? 'file trigger requires connectionCode (connection to FTP/S3/SFTP)'
            : 'file trigger requires path to watch',
        field === 'connectionCode' ? 'missing-connection-code' : 'missing-watch-path',
        field,
    );
}

function validateOptionalString(
    config: TriggerConfigRecord,
    field: string,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const value = config[field];
    if (value !== undefined && (typeof value !== 'string' || value.length === 0)) {
        addTriggerIssue(issues, stepKey, `${field} must be a non-empty string`, `invalid-${field}`, field);
    }
}

function validateOptionalBoolean(
    config: TriggerConfigRecord,
    field: string,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const value = config[field];
    if (value !== undefined && typeof value !== 'boolean') {
        addTriggerIssue(issues, stepKey, `${field} must be a boolean`, `invalid-${field}`, field);
    }
}

function validatePollInterval(
    config: TriggerConfigRecord,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const value = config.pollIntervalMs;
    if (value === undefined) return;
    if (
        typeof value !== 'number'
        || !Number.isSafeInteger(value)
        || value < FILE_WATCH.MIN_POLL_INTERVAL_MS
        || value > FILE_WATCH.MAX_POLL_INTERVAL_MS
    ) {
        addTriggerIssue(
            issues,
            stepKey,
            `pollIntervalMs must be an integer from ${FILE_WATCH.MIN_POLL_INTERVAL_MS} to ${FILE_WATCH.MAX_POLL_INTERVAL_MS}`,
            'invalid-poll-interval',
            'pollIntervalMs',
        );
    }
}

function validateMinFileAge(
    config: TriggerConfigRecord,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const value = config.minFileAge;
    if (value === undefined) return;
    if (
        typeof value !== 'number'
        || !Number.isSafeInteger(value)
        || value < FILE_WATCH.MIN_FILE_AGE_SEC
        || value > FILE_WATCH.MAX_FILE_AGE_SEC
    ) {
        addTriggerIssue(
            issues,
            stepKey,
            `minFileAge must be an integer from ${FILE_WATCH.MIN_FILE_AGE_SEC} to ${FILE_WATCH.MAX_FILE_AGE_SEC} seconds`,
            'invalid-min-file-age',
            'minFileAge',
        );
    }
}

function validateConnectedExtractor(
    definition: PipelineDefinition,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const outgoingKeys = new Set(
        (definition.edges ?? [])
            .filter(edge => edge.from === stepKey)
            .map(edge => edge.to),
    );
    const extractors = definition.steps.filter(
        step => outgoingKeys.has(step.key) && step.type === StepType.EXTRACT,
    );
    if (extractors.length === 0) {
        addTriggerIssue(
            issues,
            stepKey,
            'file trigger must connect directly to an FTP/SFTP or S3 extractor',
            'missing-file-watch-extractor',
        );
    }
    for (const extractor of extractors) {
        const adapterCode = extractor.adapterCode ?? (
            typeof extractor.config?.adapterCode === 'string'
                ? extractor.config.adapterCode
                : undefined
        );
        if (!adapterCode || !SUPPORTED_FILE_EXTRACTORS.has(adapterCode)) {
            addTriggerIssue(
                issues,
                extractor.key,
                'file trigger sources require the ftp or s3 extractor',
                'invalid-file-watch-extractor',
            );
        }
    }
}
