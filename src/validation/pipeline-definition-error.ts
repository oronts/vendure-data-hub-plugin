export interface PipelineDefinitionIssue {
    message: string;
    stepKey?: string;
    reason?: string;
    field?: string;
}

export class PipelineDefinitionError extends Error {
    readonly issues: PipelineDefinitionIssue[];

    constructor(issues: PipelineDefinitionIssue[]) {
        const message = issues.map(issue => issue.message).join('\n');
        super(message);
        this.name = 'PipelineDefinitionError';
        this.issues = issues;
        (this as any).extensions = {
            code: 'PIPELINE_VALIDATION_FAILED',
            issues,
        };
    }
}
