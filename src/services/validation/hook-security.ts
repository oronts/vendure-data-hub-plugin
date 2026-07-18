import type {
    PipelineDefinition,
    WebhookHookAction,
} from '../../types';
import { CODE_PATTERN } from '../../../shared';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { HookStage } from '../../constants/enums';
import { HOOK, WEBHOOK } from '../../constants';
import { validateScriptBlock } from '../../utils/code-security.utils';

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const SENSITIVE_HEADER_NAME_PATTERN =
    /authorization|cookie|api[-_]?key|token|secret|signature/i;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isWebhookAction(action: unknown): action is WebhookHookAction {
    return isRecord(action) && action.type === 'WEBHOOK';
}

function assertCode(value: unknown, field: string): asserts value is string {
    if (
        typeof value !== 'string'
        || value.trim() !== value
        || !CODE_PATTERN.test(value)
    ) {
        throw new Error(`${field} must be a valid code`);
    }
}

function assertHeaderName(name: string): void {
    if (typeof name !== 'string' || !HEADER_NAME_PATTERN.test(name)) {
        throw new Error(`Invalid webhook header name "${name}"`);
    }
}

function assertSecretCode(code: string, field: string): void {
    if (typeof code !== 'string' || code.trim() !== code || !CODE_PATTERN.test(code)) {
        throw new Error(`${field} must reference a valid Secret Code`);
    }
}

export function isSensitiveWebhookHeader(name: string): boolean {
    return SENSITIVE_HEADER_NAME_PATTERN.test(name);
}

export function assertWebhookHookSecurity(action: WebhookHookAction): void {
    const rawAction = action as unknown as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(rawAction, 'secret')) {
        throw new Error('Webhook hooks cannot store raw secrets; use secretCode');
    }

    const parsedUrl = new URL(action.url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('Webhook hook URLs must use http or https');
    }
    if (parsedUrl.username || parsedUrl.password) {
        throw new Error('Webhook hook URLs cannot contain embedded credentials');
    }

    if (action.secretCode !== undefined) {
        assertSecretCode(action.secretCode, 'Webhook secretCode');
    }
    if (action.signatureHeader !== undefined) {
        assertHeaderName(action.signatureHeader);
        if (!action.secretCode) {
            throw new Error('Webhook signatureHeader requires secretCode');
        }
    }

    if (action.headers !== undefined && !isRecord(action.headers)) {
        throw new Error('Webhook headers must be an object');
    }
    const staticHeaders = action.headers ?? {};
    for (const [name, value] of Object.entries(staticHeaders)) {
        assertHeaderName(name);
        if (typeof value !== 'string') {
            throw new Error(`Webhook header "${name}" must be a string`);
        }
        if (isSensitiveWebhookHeader(name)) {
            throw new Error(`Sensitive webhook header "${name}" must use headerSecretCodes`);
        }
    }

    if (action.headerSecretCodes !== undefined && !isRecord(action.headerSecretCodes)) {
        throw new Error('Webhook headerSecretCodes must be an object');
    }
    for (const [name, secretCode] of Object.entries(action.headerSecretCodes ?? {})) {
        assertHeaderName(name);
        assertSecretCode(secretCode as string, `Webhook header "${name}"`);
        if (Object.keys(staticHeaders).some(candidate => candidate.toLowerCase() === name.toLowerCase())) {
            throw new Error(`Webhook header "${name}" cannot be both static and secret-backed`);
        }
    }

    if (action.retryConfig !== undefined) {
        if (!isRecord(action.retryConfig)) {
            throw new Error('Webhook retryConfig must be an object');
        }
        assertIntegerInRange(
            action.retryConfig.maxAttempts,
            'Webhook retryConfig.maxAttempts',
            1,
            WEBHOOK.MAX_ATTEMPTS,
        );
        assertIntegerInRange(
            action.retryConfig.initialDelayMs,
            'Webhook retryConfig.initialDelayMs',
            0,
            WEBHOOK.HOOK_MAX_DELAY_MS,
        );
        assertIntegerInRange(
            action.retryConfig.maxDelayMs,
            'Webhook retryConfig.maxDelayMs',
            0,
            WEBHOOK.HOOK_MAX_DELAY_MS,
        );
        if (
            typeof action.retryConfig.backoffMultiplier !== 'number'
            || !Number.isFinite(action.retryConfig.backoffMultiplier)
            || action.retryConfig.backoffMultiplier < 1
        ) {
            throw new Error('Webhook retryConfig.backoffMultiplier must be a finite number greater than or equal to 1');
        }
    }
}

const VALID_HOOK_STAGES = new Set<string>(Object.values(HookStage));
const DATA_HOOK_STAGES = new Set<string>(
    Object.values(HookStage).filter(stage => (
        stage.startsWith('BEFORE_') || stage.startsWith('AFTER_')
    )),
);
const LOG_LEVELS = new Set(['DEBUG', 'INFO', 'WARN', 'ERROR']);

function assertIntegerInRange(
    value: unknown,
    field: string,
    minimum: number,
    maximum: number,
): asserts value is number {
    if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
        throw new Error(`${field} must be an integer between ${minimum} and ${maximum}`);
    }
}

function assertActionBase(action: Record<string, unknown>): void {
    if (action.name !== undefined && (
        typeof action.name !== 'string' || action.name.trim().length === 0
    )) {
        throw new Error('Hook action name must be a non-empty string');
    }
    if (action.failOnError !== undefined && typeof action.failOnError !== 'boolean') {
        throw new Error('Hook action failOnError must be a boolean');
    }
}

function assertOptionalTimeout(action: Record<string, unknown>, actionType: string): void {
    if (action.timeout === undefined) return;
    assertIntegerInRange(
        action.timeout,
        `${actionType} timeout`,
        HOOK.MIN_TIMEOUT_MS,
        HOOK.MAX_TIMEOUT_MS,
    );
}

function assertHookAction(action: unknown, stage: string): void {
    if (!isRecord(action)) {
        throw new Error('Hook action must be an object');
    }
    assertActionBase(action);
    if (typeof action.type !== 'string') {
        throw new Error('Hook action type must be a string');
    }

    if (
        (action.type === 'INTERCEPTOR' || action.type === 'SCRIPT')
        && !DATA_HOOK_STAGES.has(stage)
    ) {
        throw new Error(`${action.type} actions are supported only at data processing stages`);
    }

    switch (action.type) {
        case 'WEBHOOK':
            assertWebhookHookSecurity(action as unknown as WebhookHookAction);
            return;
        case 'EMIT':
            if (
                typeof action.event !== 'string'
                || action.event.trim() !== action.event
                || action.event.length === 0
                || action.event.length > HOOK.MAX_EVENT_NAME_LENGTH
            ) {
                throw new Error(`EMIT event must be a non-empty string up to ${HOOK.MAX_EVENT_NAME_LENGTH} characters`);
            }
            return;
        case 'TRIGGER_PIPELINE':
            assertCode(action.pipelineCode, 'TRIGGER_PIPELINE pipelineCode');
            assertCode(action.triggerKey, 'TRIGGER_PIPELINE triggerKey');
            return;
        case 'LOG':
            if (action.level !== undefined && (
                typeof action.level !== 'string' || !LOG_LEVELS.has(action.level)
            )) {
                throw new Error('LOG level must be DEBUG, INFO, WARN, or ERROR');
            }
            if (action.message !== undefined && (
                typeof action.message !== 'string'
                || action.message.length === 0
                || action.message.length > HOOK.MAX_LOG_MESSAGE_LENGTH
            )) {
                throw new Error(`LOG message must be a non-empty string up to ${HOOK.MAX_LOG_MESSAGE_LENGTH} characters`);
            }
            return;
        case 'INTERCEPTOR':
            if (typeof action.code !== 'string' || action.code.trim().length === 0) {
                throw new Error('INTERCEPTOR code must be a non-empty string');
            }
            assertOptionalTimeout(action, 'INTERCEPTOR');
            validateScriptBlock(action.code);
            return;
        case 'SCRIPT':
            assertCode(action.scriptName, 'SCRIPT scriptName');
            assertOptionalTimeout(action, 'SCRIPT');
            if (action.args !== undefined && !isRecord(action.args)) {
                throw new Error('SCRIPT args must be an object');
            }
            return;
        default:
            throw new Error(`Unsupported hook action type "${action.type}"`);
    }
}

export function validateHooks(
    definition: PipelineDefinition,
    issues: PipelineDefinitionIssue[],
): void {
    for (const [stage, actions] of Object.entries(definition.hooks ?? {})) {
        if (!VALID_HOOK_STAGES.has(stage)) {
            issues.push({
                message: `Unknown hook stage "${stage}"`,
                errorCode: 'hook-stage-invalid',
            });
        }
        if (!Array.isArray(actions)) {
            issues.push({
                message: `Hook stage "${stage}" must contain an action array`,
                errorCode: 'hook-actions-invalid',
            });
            continue;
        }
        for (const action of actions) {
            try {
                assertHookAction(action, stage);
            } catch (error) {
                issues.push({
                    message: `Hook stage "${stage}": ${error instanceof Error ? error.message : String(error)}`,
                    errorCode: isWebhookAction(action)
                        ? 'webhook-hook-security-invalid'
                        : 'hook-action-invalid',
                });
            }
        }
    }
}

export function sanitizePipelineDefinitionForOutput(
    definition: PipelineDefinition,
): PipelineDefinition {
    const sanitized = structuredClone(definition);
    for (const actions of Object.values(sanitized.hooks ?? {})) {
        if (!Array.isArray(actions)) continue;
        for (const action of actions) {
            if (!isWebhookAction(action)) continue;
            const rawAction = action as unknown as Record<string, unknown>;
            delete rawAction.secret;
            if (action.headers) {
                action.headers = Object.fromEntries(
                    Object.entries(action.headers)
                        .filter(([name]) => !isSensitiveWebhookHeader(name)),
                );
            }
            try {
                const url = new URL(action.url);
                url.username = '';
                url.password = '';
                for (const name of [...url.searchParams.keys()]) {
                    if (isSensitiveWebhookHeader(name)) {
                        url.searchParams.delete(name);
                    }
                }
                action.url = url.toString();
            } catch {
                action.url = '<invalid-url>';
            }
        }
    }
    return sanitized;
}
