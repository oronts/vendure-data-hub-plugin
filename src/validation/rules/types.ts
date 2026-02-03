/**
 * Validation Rule Types
 *
 * Type definitions for step, pipeline, and field validators.
 */

import { StepType } from '../../constants/enums';
import { JsonObject } from '../../types/index';

// STEP VALIDATION TYPES

/**
 * Result of step validation
 */
export interface StepValidationResult {
    valid: boolean;
    errors: StepValidationError[];
    warnings: StepValidationWarning[];
}

/**
 * Step validation error
 */
export interface StepValidationError {
    field: string;
    message: string;
    errorCode: string;
}

/**
 * Step validation warning
 */
export interface StepValidationWarning {
    field: string;
    message: string;
}

/**
 * Step definition interface for validation
 * Note: type accepts string for compatibility with external inputs,
 * but validators will reject invalid step types with proper error messages.
 */
export interface StepDefinition {
    key: string;
    /** Step type - must be a valid StepType enum value */
    type: StepType | string;
    name?: string;
    config: JsonObject;
    concurrency?: number;
    async?: boolean;
}

// PIPELINE VALIDATION TYPES

/**
 * Pipeline edge definition
 */
export interface PipelineEdge {
    from: string;
    to: string;
    branch?: string;
}

/**
 * Pipeline definition for validation
 */
export interface PipelineDefinitionInput {
    version: number | string;
    steps: StepDefinition[];
    edges?: PipelineEdge[];
    dependsOn?: string[];
    capabilities?: JsonObject;
    context?: JsonObject;
    hooks?: JsonObject;
}

/**
 * Result of pipeline validation
 */
export interface PipelineValidationResult {
    valid: boolean;
    errors: PipelineValidationError[];
    warnings: PipelineValidationWarning[];
    topology?: TopologyInfo;
}

/**
 * Pipeline validation error
 */
export interface PipelineValidationError {
    field: string;
    message: string;
    errorCode: string;
}

/**
 * Pipeline validation warning
 */
export interface PipelineValidationWarning {
    field: string;
    message: string;
}

/**
 * Topology analysis information
 */
export interface TopologyInfo {
    rootSteps: string[];
    leafSteps: string[];
    executionOrder: string[];
    hasParallelPaths: boolean;
    maxDepth: number;
}

// FIELD VALIDATION TYPES

/**
 * Result of a field validation
 */
export interface FieldValidationResult {
    valid: boolean;
    error?: string;
    errorCode?: string;
    value?: unknown;
}

/**
 * Field validation options
 */
export interface FieldValidationOptions {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: RegExp;
    patternName?: string;
    allowNull?: boolean;
    trimWhitespace?: boolean;
    coerce?: boolean;
}
