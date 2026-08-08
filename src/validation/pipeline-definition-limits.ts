import { PIPELINE_DEFINITION_LIMITS } from '../constants/defaults/validation-defaults';
import { PIPELINE_VALIDATION_ERROR } from '../constants/enums';
import type { PipelineDefinition } from '../types';
import { PipelineDefinitionError } from './pipeline-definition-error';
import { createPipelineDefinitionIssue } from './pipeline-validation-issues';

interface DefinitionTraversalFrame {
    readonly depth: number;
    readonly exiting: boolean;
    readonly value: object;
}

export function validatePipelineDefinitionLimits(
    definition: PipelineDefinition,
): void {
    const stack: DefinitionTraversalFrame[] = [
        { depth: 1, exiting: false, value: definition },
    ];
    const ancestors = new WeakSet<object>();

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) break;
        if (current.exiting) {
            ancestors.delete(current.value);
            continue;
        }
        if (current.depth > PIPELINE_DEFINITION_LIMITS.MAX_DEPTH) {
            throw new PipelineDefinitionError([
                createPipelineDefinitionIssue(
                    `Pipeline definition cannot exceed ${PIPELINE_DEFINITION_LIMITS.MAX_DEPTH} nested levels`,
                    PIPELINE_VALIDATION_ERROR.DEFINITION_TOO_DEEP,
                ),
            ]);
        }
        if (ancestors.has(current.value)) {
            throw new PipelineDefinitionError([
                createPipelineDefinitionIssue(
                    'Pipeline definition must not contain circular references',
                    PIPELINE_VALIDATION_ERROR.INVALID_DEFINITION,
                ),
            ]);
        }

        ancestors.add(current.value);
        stack.push({ ...current, exiting: true });
        let children: unknown[];
        try {
            if (Array.isArray(current.value)) {
                children = current.value;
            } else {
                const prototype = Object.getPrototypeOf(current.value);
                if (prototype !== Object.prototype && prototype !== null) {
                    throw invalidJsonDefinitionError();
                }
                children = Object.values(current.value);
            }
        } catch {
            throw invalidJsonDefinitionError();
        }
        for (const child of children) {
            if (child !== null && typeof child === 'object') {
                stack.push({
                    depth: current.depth + 1,
                    exiting: false,
                    value: child,
                });
            } else if (!isJsonPrimitive(child)) {
                throw invalidJsonDefinitionError();
            }
        }
    }

    let serialized: string | undefined;
    try {
        serialized = JSON.stringify(definition);
    } catch {
        throw invalidJsonDefinitionError();
    }
    if (serialized === undefined) {
        throw invalidJsonDefinitionError();
    }
    const byteLength = Buffer.byteLength(serialized, 'utf8');
    if (byteLength > PIPELINE_DEFINITION_LIMITS.MAX_BYTES) {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                `Pipeline definition cannot exceed ${PIPELINE_DEFINITION_LIMITS.MAX_BYTES} bytes`,
                PIPELINE_VALIDATION_ERROR.DEFINITION_TOO_LARGE,
            ),
        ]);
    }
}

function invalidJsonDefinitionError(): PipelineDefinitionError {
    return new PipelineDefinitionError([
        createPipelineDefinitionIssue(
            'Pipeline definition must contain only serializable JSON values',
            PIPELINE_VALIDATION_ERROR.INVALID_DEFINITION,
        ),
    ]);
}

function isJsonPrimitive(value: unknown): boolean {
    return value === null
        || typeof value === 'string'
        || typeof value === 'boolean'
        || typeof value === 'number' && Number.isFinite(value);
}
