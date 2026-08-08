/**
 * Context and capabilities validation for pipeline definitions.
 * Handles validation of pipeline context settings and capabilities.
 */

import {
    ChannelStrategy,
    ValidationStrictness,
} from '../../constants/enums';
import { PipelineDefinition } from '../../types/index';
import { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import {
    isRecord,
    validateErrorHandling,
    validateParallelExecution,
    validateThroughput,
} from './execution-policy-validation';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Pipeline capabilities structure
 */
interface PipelineCapabilitiesConfig {
    writes?: string[];
    requires?: string[];
}

const SUPPORTED_CHANNEL_STRATEGIES: ReadonlySet<string> = new Set(
    Object.values(ChannelStrategy),
);
const SUPPORTED_VALIDATION_MODES: ReadonlySet<string> = new Set(
    Object.values(ValidationStrictness),
);

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates pipeline capabilities configuration.
 */
export function validateCapabilities(definition: PipelineDefinition, issues: PipelineDefinitionIssue[]): void {
    if (!definition.capabilities || typeof definition.capabilities !== 'object') {
        return;
    }

    const caps = definition.capabilities as PipelineCapabilitiesConfig;

    if (caps.writes !== undefined) {
        validateCapabilitiesWrites(caps.writes, issues);
    }

    if (caps.requires !== undefined && !Array.isArray(caps.requires)) {
        issues.push({
            message: 'capabilities.requires must be an array of permission names',
            errorCode: 'capabilities-invalid',
        });
    }

    if ('streamSafe' in caps) {
        issues.push({
            message: 'capabilities.streamSafe is not supported',
            errorCode: 'capabilities-invalid',
        });
    }
}

/**
 * Validates the writes array in capabilities.
 */
function validateCapabilitiesWrites(writes: unknown, issues: PipelineDefinitionIssue[]): void {
    if (!Array.isArray(writes)) {
        issues.push({ message: 'capabilities.writes must be an array', errorCode: 'capabilities-invalid' });
        return;
    }

    const allowed = new Set(['catalog', 'customers', 'orders', 'promotions', 'inventory', 'custom']);
    for (const w of writes) {
        const lowerW = typeof w === 'string' ? w.toLowerCase() : '';
        if (typeof w !== 'string' || !allowed.has(lowerW)) {
            issues.push({
                message: `capabilities.writes contains invalid domain: ${String(w)}`,
                errorCode: 'capabilities-invalid-domain',
            });
        }
    }
}

/**
 * Validates pipeline context configuration.
 */
export function validateContext(definition: PipelineDefinition, issues: PipelineDefinitionIssue[]): void {
    const rawPipelineContext = definition.context as unknown;
    let pipelineContext: Record<string, unknown> | undefined;
    if (rawPipelineContext !== undefined) {
        if (!isRecord(rawPipelineContext)) {
            issues.push({
                message: 'context must be an object',
                errorCode: 'context-invalid',
                field: 'context',
            });
        } else {
            pipelineContext = rawPipelineContext;
        }
    }

    if (pipelineContext) {
        validateContextFields(pipelineContext, 'context', issues);
        if ('lateEvents' in pipelineContext) {
            issues.push({
                message: 'context.lateEvents is not supported',
                errorCode: 'context-invalid',
                field: 'context.lateEvents',
            });
        }
        if ('watermarkMs' in pipelineContext) {
            issues.push({
                message: 'context.watermarkMs is not supported',
                errorCode: 'context-invalid',
                field: 'context.watermarkMs',
            });
        }

        validateParallelExecution(
            pipelineContext.parallelExecution,
            issues,
            'context.parallelExecution',
        );
        validateErrorHandling(
            pipelineContext.errorHandling,
            issues,
            'context.errorHandling',
        );
    }

    for (const step of definition.steps) {
        validateThroughput(
            step.throughput,
            `steps.${step.key}.throughput`,
            issues,
            step.key,
        );
        if (step.context === undefined) continue;
        const path = `steps.${step.key}.context`;
        if (!isRecord(step.context)) {
            issues.push({
                message: `${path} must be an object`,
                errorCode: 'context-invalid',
                stepKey: step.key,
                field: path,
            });
            continue;
        }
        const stepContext = step.context as Record<string, unknown>;
        validateContextFields(stepContext, path, issues, step.key);
        validateChannelSelection(
            {
                ...pipelineContext,
                ...stepContext,
            },
            path,
            issues,
            step.key,
        );
    }

    if (pipelineContext) {
        validateChannelSelection(pipelineContext, 'context', issues);
    }
}

function validateContextFields(
    context: Record<string, unknown>,
    path: string,
    issues: PipelineDefinitionIssue[],
    stepKey?: string,
): void {
    if (Object.prototype.hasOwnProperty.call(context, 'runMode')) {
        issues.push({
            message: `${path}.runMode is not supported`,
            errorCode: 'context-invalid',
            stepKey,
            field: `${path}.runMode`,
        });
    }
    if (
        context.channelStrategy !== undefined
        && !SUPPORTED_CHANNEL_STRATEGIES.has(String(context.channelStrategy))
    ) {
        issues.push({
            message: `${path}.channelStrategy must be EXPLICIT, INHERIT, or MULTI`,
            errorCode: 'context-invalid',
            stepKey,
            field: `${path}.channelStrategy`,
        });
    }
    if (
        context.validationMode !== undefined
        && !SUPPORTED_VALIDATION_MODES.has(String(context.validationMode))
    ) {
        issues.push({
            message: `${path}.validationMode must be STRICT or LENIENT`,
            errorCode: 'context-invalid',
            stepKey,
            field: `${path}.validationMode`,
        });
    }
    validateNonEmptyString(context.channel, `${path}.channel`, issues, stepKey);
    validateNonEmptyString(
        context.idempotencyKeyField,
        `${path}.idempotencyKeyField`,
        issues,
        stepKey,
    );
    if (
        context.contentLanguage !== undefined
        && (
            typeof context.contentLanguage !== 'string'
            || context.contentLanguage.trim().length === 0
        )
    ) {
        issues.push({
            message: `${path}.contentLanguage must be a non-empty language code`,
            errorCode: 'context-invalid',
            stepKey,
            field: `${path}.contentLanguage`,
        });
    }
    if (context.channelIds !== undefined) {
        const channelIds = context.channelIds;
        if (
            !Array.isArray(channelIds)
            || channelIds.some(channelId => (
                typeof channelId !== 'string' || channelId.trim().length === 0
            ))
        ) {
            issues.push({
                message: `${path}.channelIds must contain non-empty channel IDs`,
                errorCode: 'context-invalid',
                stepKey,
                field: `${path}.channelIds`,
            });
        }
    }
    validateThroughput(context.throughput, `${path}.throughput`, issues, stepKey);
}

function validateChannelSelection(
    context: Record<string, unknown>,
    path: string,
    issues: PipelineDefinitionIssue[],
    stepKey?: string,
): void {
    if (
        context.channelStrategy !== 'EXPLICIT'
        && context.channelStrategy !== 'MULTI'
    ) {
        return;
    }
    if (
        !Array.isArray(context.channelIds)
        || context.channelIds.length === 0
    ) {
        issues.push({
            message: `${path}.channelIds is required for ${context.channelStrategy} channel strategy`,
            errorCode: 'context-invalid',
            stepKey,
            field: `${path}.channelIds`,
        });
    }
}

function validateNonEmptyString(
    value: unknown,
    field: string,
    issues: PipelineDefinitionIssue[],
    stepKey?: string,
): void {
    if (
        value !== undefined
        && (typeof value !== 'string' || value.trim().length === 0)
    ) {
        issues.push({
            message: `${field} must be a non-empty string`,
            errorCode: 'context-invalid',
            stepKey,
            field,
        });
    }
}
