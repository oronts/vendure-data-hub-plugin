export const gateSchema = `
    """
    Result of a gate approval or rejection action
    """
    type DataHubGateActionResult {
        "Whether the action was successful"
        success: Boolean!
        "The updated pipeline run after the gate action"
        run: DataHubPipelineRun
        "Error message if the action failed"
        message: String
    }
`;

export const gateQueries = ``;

export const gateMutations = `
    extend type Mutation {
        "Approve a GATE step, resuming the paused pipeline run"
        approveDataHubGate(runId: ID!, stepKey: String!): DataHubGateActionResult!
        "Reject a GATE step, cancelling the paused pipeline run"
        rejectDataHubGate(runId: ID!, stepKey: String!): DataHubGateActionResult!
    }
`;
