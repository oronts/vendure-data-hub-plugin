export const sandboxComparisonSchema = `
    # ============================================
    # COMPARISON TYPES
    # ============================================

    """
    Comparison of two sandbox runs
    """
    type DataHubSandboxComparison {
        "First run result"
        before: DataHubSandboxResult!
        "Second run result"
        after: DataHubSandboxResult!
        "Summary of differences"
        summary: DataHubSandboxComparisonSummary!
        "Steps that changed"
        changedSteps: [DataHubSandboxStepComparison!]!
    }

    """
    Summary of differences between two sandbox runs
    """
    type DataHubSandboxComparisonSummary {
        "Total steps that changed behavior"
        stepsChanged: Int!
        "Records that would be processed differently"
        recordsAffected: Int!
        "Net change in success count"
        successCountDelta: Int!
        "Net change in failure count"
        failureCountDelta: Int!
        "Net change in filtered count"
        filteredCountDelta: Int!
        "Duration change"
        durationDeltaMs: Int!
    }

    """
    Comparison of a single step between two runs
    """
    type DataHubSandboxStepComparison {
        stepKey: String!
        stepName: String!
        "Records out in before run"
        recordsOutBefore: Int!
        "Records out in after run"
        recordsOutAfter: Int!
        "Duration in before run"
        durationBefore: Int!
        "Duration in after run"
        durationAfter: Int!
        "Fields that changed behavior"
        fieldChanges: [String!]!
    }
`;
