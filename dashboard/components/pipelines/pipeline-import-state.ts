import type { PipelineDefinition } from '../../types';

export interface ValidatedPipelineImport {
    readonly sourceText: string;
    readonly definition: PipelineDefinition;
}

export function getCurrentValidatedDefinition(
    validated: ValidatedPipelineImport | null,
    currentText: string,
): PipelineDefinition | null {
    return validated?.sourceText === currentText ? validated.definition : null;
}
