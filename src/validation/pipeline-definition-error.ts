export interface PipelineDefinitionIssue {
    message: string;
    stepKey?: string;
    errorCode?: string;
    field?: string;
}

/**
 * GraphQL error extensions interface for pipeline validation errors
 */
interface PipelineValidationExtensions {
    code: string;
    issues: PipelineDefinitionIssue[];
}

export class PipelineDefinitionError extends Error {
    readonly issues: PipelineDefinitionIssue[];
    readonly extensions: PipelineValidationExtensions;

    constructor(issues: PipelineDefinitionIssue[]) {
        const message = issues.map(issue => issue.message).join('\n');
        super(message);
        this.name = 'PipelineDefinitionError';
        this.issues = issues;
        this.extensions = {
            code: 'PIPELINE_VALIDATION_FAILED',
            issues,
        };
    }
}
