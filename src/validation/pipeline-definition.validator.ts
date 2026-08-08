import { PIPELINE_VALIDATION_ERROR } from '../constants/enums';
import {
    PipelineDefinition,
    PipelineEdge,
    PipelineStepDefinition,
    StepType,
} from '../types';
import { PipelineDefinitionError } from './pipeline-definition-error';
import { validatePipelineDefinitionLimits } from './pipeline-definition-limits';
import { validatePipelineDag } from './pipeline-graph.validator';
import { validatePipelineStep } from './pipeline-step.validator';
import { createPipelineDefinitionIssue } from './pipeline-validation-issues';

export function validatePipelineDefinition(definition: PipelineDefinition): void {
    if (!definition || typeof definition !== 'object') {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                'Invalid pipeline definition',
                PIPELINE_VALIDATION_ERROR.INVALID_DEFINITION,
            ),
        ]);
    }

    const version = definition.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                'PipelineDefinition.version must be a positive integer',
                PIPELINE_VALIDATION_ERROR.INVALID_VERSION,
                undefined,
                'version',
            ),
        ]);
    }

    if (!Array.isArray(definition.steps)) {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                'PipelineDefinition.steps must be an array',
                PIPELINE_VALIDATION_ERROR.INVALID_DEFINITION,
                undefined,
                'steps',
            ),
        ]);
    }

    validatePipelineDefinitionLimits(definition);

    const keys = new Set<string>();
    const firstStep = definition.steps[0];
    definition.steps.forEach((step: PipelineStepDefinition, index: number) => {
        validatePipelineStep(step, index, keys);
    });

    if (definition.edges !== undefined && !Array.isArray(definition.edges)) {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                'PipelineDefinition.edges must be an array',
                PIPELINE_VALIDATION_ERROR.INVALID_EDGE,
                undefined,
                'edges',
            ),
        ]);
    }

    const edges: PipelineEdge[] = definition.edges ?? [];
    if (edges.length === 0) {
        if (
            firstStep
            && firstStep.type !== StepType.TRIGGER
            && firstStep.type !== StepType.EXTRACT
        ) {
            throw new PipelineDefinitionError([
                createPipelineDefinitionIssue(
                    'First step should be a TRIGGER or EXTRACT (data source)',
                    PIPELINE_VALIDATION_ERROR.INVALID_ROOT_TYPE,
                    firstStep?.key,
                    'steps[0].type',
                ),
            ]);
        }
        return;
    }

    validatePipelineDag(definition.steps, edges);
}
