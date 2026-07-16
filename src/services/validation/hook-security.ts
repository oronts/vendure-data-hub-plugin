import type {
    HookAction,
    PipelineDefinition,
    WebhookHookAction,
} from '../../types';
import { CODE_PATTERN } from '../../../shared';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const SENSITIVE_HEADER_NAME_PATTERN =
    /authorization|cookie|api[-_]?key|token|secret|signature/i;

function isWebhookAction(action: HookAction): action is WebhookHookAction {
    return action.type === 'WEBHOOK';
}

function assertHeaderName(name: string): void {
    if (!HEADER_NAME_PATTERN.test(name)) {
        throw new Error(`Invalid webhook header name "${name}"`);
    }
}

function assertSecretCode(code: string, field: string): void {
    if (!CODE_PATTERN.test(code)) {
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

    for (const [name, secretCode] of Object.entries(action.headerSecretCodes ?? {})) {
        assertHeaderName(name);
        assertSecretCode(secretCode, `Webhook header "${name}"`);
        if (Object.keys(staticHeaders).some(candidate => candidate.toLowerCase() === name.toLowerCase())) {
            throw new Error(`Webhook header "${name}" cannot be both static and secret-backed`);
        }
    }
}

export function validateWebhookHooks(
    definition: PipelineDefinition,
    issues: PipelineDefinitionIssue[],
): void {
    for (const [stage, actions] of Object.entries(definition.hooks ?? {})) {
        if (!Array.isArray(actions)) {
            issues.push({
                message: `Hook stage "${stage}" must contain an action array`,
                errorCode: 'hook-actions-invalid',
            });
            continue;
        }
        for (const action of actions) {
            if (!isWebhookAction(action)) continue;
            try {
                assertWebhookHookSecurity(action);
            } catch (error) {
                issues.push({
                    message: `Hook stage "${stage}": ${error instanceof Error ? error.message : String(error)}`,
                    errorCode: 'webhook-hook-security-invalid',
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
