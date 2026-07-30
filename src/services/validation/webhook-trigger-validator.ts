import { CODE_PATTERN } from '../../../shared';
import { WEBHOOK } from '../../constants/defaults';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import {
    addTriggerIssue,
    rejectUnsupportedTriggerFields,
    type TriggerConfigRecord,
} from './trigger-validation-utils';

const WEBHOOK_AUTH_TYPES = new Set(['NONE', 'BASIC', 'API_KEY', 'HMAC', 'JWT']);
const LEGACY_WEBHOOK_FIELDS = [
    'authType',
    'signature',
    'signatureHeader',
    'hmacSecretCode',
    'secret',
    'webhookPath',
    'webhookCode',
    'path',
] as const;
const UNSUPPORTED_WEBHOOK_FIELDS = [
    'webhook',
    'validatePayload',
    'payloadSchema',
] as const;
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function validateWebhookTrigger(
    stepKey: string,
    config: TriggerConfigRecord,
    issues: PipelineDefinitionIssue[],
    warnings: PipelineDefinitionIssue[],
): void {
    for (const field of LEGACY_WEBHOOK_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(config, field)) continue;
        addTriggerIssue(
            issues,
            stepKey,
            `legacy webhook field "${field}" is not supported`,
            'legacy-webhook-field',
            field,
        );
    }
    rejectUnsupportedTriggerFields(
        config,
        UNSUPPORTED_WEBHOOK_FIELDS,
        stepKey,
        'webhook',
        issues,
    );

    const authType = config.authentication;
    if (typeof authType !== 'string' || !WEBHOOK_AUTH_TYPES.has(authType)) {
        addTriggerIssue(
            issues,
            stepKey,
            'webhook authentication must be one of NONE, BASIC, API_KEY, HMAC, or JWT',
            'invalid-webhook-authentication',
            'authentication',
        );
        return;
    }

    validateAuthenticationConfig(authType, config, stepKey, issues, warnings);
    for (const field of [
        'apiKeyHeaderName',
        'hmacHeaderName',
        'jwtHeaderName',
        'idempotencyKeyHeader',
    ]) {
        validateOptionalHeader(config, field, stepKey, issues);
    }
    validateOptionalJwtClaim(config, 'jwtIssuer', stepKey, issues);
    validateOptionalJwtClaim(config, 'jwtAudience', stepKey, issues);
    validateOptionalString(config, 'apiKeyPrefix', stepKey, issues);
    validateOptionalBoolean(config, 'requireIdempotencyKey', stepKey, issues);
    validateWebhookRequestControls(config, stepKey, issues);
}

function validateAuthenticationConfig(
    authType: string,
    config: TriggerConfigRecord,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
    warnings: PipelineDefinitionIssue[],
): void {
    if (authType === 'HMAC') {
        validateSecretCode(config, 'secretCode', stepKey, issues);
        const algorithm = config.hmacAlgorithm ?? 'SHA256';
        if (algorithm !== 'SHA256' && algorithm !== 'SHA512') {
            addTriggerIssue(
                issues,
                stepKey,
                'webhook hmacAlgorithm must be SHA256 or SHA512',
                'invalid-webhook-hmac-algorithm',
                'hmacAlgorithm',
            );
        }
    } else if (authType === 'API_KEY') {
        validateSecretCode(config, 'apiKeySecretCode', stepKey, issues);
    } else if (authType === 'BASIC') {
        validateSecretCode(config, 'basicSecretCode', stepKey, issues);
    } else if (authType === 'JWT') {
        validateSecretCode(config, 'jwtSecretCode', stepKey, issues);
    } else {
        warnings.push({
            message: `Step "${stepKey}": webhook authentication is explicitly disabled`,
            stepKey,
            errorCode: 'unauthenticated-webhook',
        });
    }
}

function validateSecretCode(
    config: TriggerConfigRecord,
    field: string,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const value = config[field];
    if (typeof value !== 'string' || !CODE_PATTERN.test(value)) {
        addTriggerIssue(
            issues,
            stepKey,
            `webhook trigger requires a valid ${field} Secret Code`,
            `invalid-${field.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)}`,
            field,
        );
    }
}

function validateOptionalHeader(
    config: TriggerConfigRecord,
    field: string,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const value = config[field];
    if (value !== undefined && (typeof value !== 'string' || !HEADER_NAME_PATTERN.test(value))) {
        addTriggerIssue(
            issues,
            stepKey,
            `webhook ${field} must be a valid HTTP header name`,
            'invalid-webhook-header-name',
            field,
        );
    }
}

function validateOptionalJwtClaim(
    config: TriggerConfigRecord,
    field: 'jwtIssuer' | 'jwtAudience',
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const value = config[field];
    if (
        value !== undefined
        && (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > WEBHOOK.MAX_JWT_CLAIM_LENGTH)
    ) {
        addTriggerIssue(
            issues,
            stepKey,
            `webhook ${field} must contain 1-${WEBHOOK.MAX_JWT_CLAIM_LENGTH} non-whitespace characters`,
            'invalid-webhook-jwt-claim',
            field,
        );
    }
}

function validateOptionalString(
    config: TriggerConfigRecord,
    field: string,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const value = config[field];
    if (value !== undefined && typeof value !== 'string') {
        addTriggerIssue(issues, stepKey, `${field} must be a string`, `invalid-${field}`, field);
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

function validateWebhookRequestControls(
    config: TriggerConfigRecord,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    validateBoundedInteger(
        config.rateLimit,
        0,
        WEBHOOK.MAX_RATE_LIMIT_REQUESTS,
        'rateLimit',
        'invalid-webhook-rate-limit',
        stepKey,
        issues,
    );
    validateBoundedInteger(
        config.rateLimitWindow,
        WEBHOOK.MIN_RATE_LIMIT_WINDOW_SEC,
        WEBHOOK.MAX_RATE_LIMIT_WINDOW_SEC,
        'rateLimitWindow',
        'invalid-webhook-rate-limit-window',
        stepKey,
        issues,
    );
    validateBoundedInteger(
        config.idempotencyTtlSec,
        WEBHOOK.MIN_IDEMPOTENCY_TTL_SEC,
        WEBHOOK.MAX_IDEMPOTENCY_TTL_SEC,
        'idempotencyTtlSec',
        'invalid-webhook-idempotency-ttl',
        stepKey,
        issues,
    );
}

function validateBoundedInteger(
    value: unknown,
    min: number,
    max: number,
    field: string,
    errorCode: string,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    if (value === undefined) return;
    if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
        addTriggerIssue(
            issues,
            stepKey,
            `webhook ${field} must be an integer from ${min} to ${max}`,
            errorCode,
            field,
        );
    }
}
