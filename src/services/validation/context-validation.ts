/**
 * Context and capabilities validation for pipeline definitions.
 * Handles validation of pipeline context settings and capabilities.
 */

import { PARALLEL_EXECUTION } from '../../constants/defaults/runtime-defaults';
import { PipelineDefinition } from '../../types/index';
import { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';

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

const SUPPORTED_RUN_MODES = new Set(['SYNC', 'ASYNC', 'BATCH']);

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
    if (!definition.context) {
        return;
    }

    const context = definition.context as Record<string, unknown>;
    if (
        context.runMode !== undefined &&
        !SUPPORTED_RUN_MODES.has(String(context.runMode))
    ) {
        issues.push({
            message: 'context.runMode must be SYNC, ASYNC, or BATCH',
            errorCode: 'context-invalid',
        });
    }
    if ('lateEvents' in context) {
        issues.push({
            message: 'context.lateEvents is not supported',
            errorCode: 'context-invalid',
        });
    }
    if ('watermarkMs' in context) {
        issues.push({
            message: 'context.watermarkMs is not supported',
            errorCode: 'context-invalid',
        });
    }

    validateParallelExecution(definition.context.parallelExecution, issues);
}

function validateParallelExecution(
    value: unknown,
    issues: PipelineDefinitionIssue[],
): void {
    if (value === undefined) return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        issues.push({
            message: 'context.parallelExecution must be an object',
            errorCode: 'context-invalid',
        });
        return;
    }
    const config = value as Record<string, unknown>;
    if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
        issues.push({
            message: 'context.parallelExecution.enabled must be a boolean',
            errorCode: 'context-invalid',
        });
    }
    if (
        config.maxConcurrentSteps !== undefined
        && (
            !Number.isSafeInteger(config.maxConcurrentSteps)
            || (config.maxConcurrentSteps as number) < 1
            || (config.maxConcurrentSteps as number) > PARALLEL_EXECUTION.MAX_CONCURRENT_STEPS
        )
    ) {
        issues.push({
            message: `context.parallelExecution.maxConcurrentSteps must be an integer from 1 to ${PARALLEL_EXECUTION.MAX_CONCURRENT_STEPS}`,
            errorCode: 'context-invalid',
        });
    }
    if (
        config.errorPolicy !== undefined
        && !PARALLEL_EXECUTION.ERROR_POLICIES.some(
            policy => policy === config.errorPolicy,
        )
    ) {
        issues.push({
            message: 'context.parallelExecution.errorPolicy must be FAIL_FAST, CONTINUE, or BEST_EFFORT',
            errorCode: 'context-invalid',
        });
    }
}
