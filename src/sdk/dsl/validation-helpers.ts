import { PipelineStepDefinition } from '../../types/index';

// ── Shared validation helpers for DSL builders ──────────────────────────────

export function validateNonEmptyString(value: string, fieldName: string): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${fieldName} must be a non-empty string`);
    }
}

export function validateNonEmptyArray<T>(arr: T[], fieldName: string): void {
    if (!Array.isArray(arr) || arr.length === 0) {
        throw new Error(`${fieldName} must be a non-empty array`);
    }
}

export function validateMapping(mapping: Record<string, string>, fieldName: string): void {
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
        throw new Error(`${fieldName} must be an object`);
    }
    if (Object.keys(mapping).length === 0) {
        throw new Error(`${fieldName} must have at least one entry`);
    }
}

export function validatePositiveNumber(value: number, fieldName: string): void {
    if (typeof value !== 'number' || value <= 0) {
        throw new Error(`${fieldName} must be a positive number`);
    }
}

export function validateUniqueKey(steps: PipelineStepDefinition[], key: string): void {
    if (steps.some(s => s.key === key)) {
        throw new Error(`Duplicate step key: "${key}". Step keys must be unique within a pipeline.`);
    }
}

export function validateVersion(version: number): void {
    if (!Number.isInteger(version) || version < 1) {
        throw new Error(`Version must be a positive integer, got: ${version}`);
    }
}
