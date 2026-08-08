import type { PipelineDefinitionIssue } from './pipeline-definition-error';

export function createPipelineDefinitionIssue(
    message: string,
    errorCode: string,
    stepKey?: string,
    field?: string,
): PipelineDefinitionIssue {
    return { message, errorCode, stepKey, field };
}
