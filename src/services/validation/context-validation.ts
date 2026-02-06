/**
 * Context and capabilities validation for pipeline definitions.
 * Handles validation of pipeline context settings, capabilities, and late events policies.
 */

import { LateEventsPolicy } from '../../constants/enums';
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
    streamSafe?: boolean;
}

/**
 * Late events policy configuration
 */
interface LateEventsConfig {
    policy: string;
    bufferMs?: number;
}

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

    if (caps.streamSafe !== undefined && typeof caps.streamSafe !== 'boolean') {
        issues.push({
            message: 'capabilities.streamSafe must be a boolean',
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
 * Validates pipeline context configuration including late events and watermarks.
 */
export function validateContext(definition: PipelineDefinition, issues: PipelineDefinitionIssue[]): void {
    if (!definition.context) {
        return;
    }

    if (definition.context.lateEvents) {
        validateLateEvents(definition.context.lateEvents as LateEventsConfig, issues);
    }

    validateWatermark(definition.context.watermarkMs, issues);
}

/**
 * Validates late events policy configuration.
 */
function validateLateEvents(le: LateEventsConfig, issues: PipelineDefinitionIssue[]): void {
    const policyLower = typeof le.policy === 'string' ? le.policy.toLowerCase() : '';

    if (policyLower !== LateEventsPolicy.DROP && policyLower !== LateEventsPolicy.BUFFER) {
        issues.push({
            message: 'context.lateEvents.policy must be drop|buffer',
            errorCode: 'context-invalid',
        });
    }

    if (policyLower === LateEventsPolicy.BUFFER && (typeof le.bufferMs !== 'number' || le.bufferMs <= 0)) {
        issues.push({
            message: 'context.lateEvents.bufferMs must be a positive number when policy=buffer',
            errorCode: 'context-invalid',
        });
    }
}

/**
 * Validates watermark configuration.
 */
function validateWatermark(watermarkMs: unknown, issues: PipelineDefinitionIssue[]): void {
    if (
        watermarkMs !== undefined &&
        watermarkMs !== null &&
        (typeof watermarkMs !== 'number' || watermarkMs < 0)
    ) {
        issues.push({
            message: 'context.watermarkMs must be a non-negative number',
            errorCode: 'context-invalid',
        });
    }
}
