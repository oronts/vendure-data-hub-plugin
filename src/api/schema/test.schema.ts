export const testSchema = `
    "Result from extract preview"
    type DataHubPreviewResult {
        records: [JSON!]!
        totalCount: Int
        notes: [String!]
    }

    "Summary of validation results"
    type DataHubValidationSummary {
        input: Int!
        passed: Int!
        failed: Int!
        passRate: Int!
    }

    "Result from validate simulation"
    type DataHubValidateResult {
        records: [JSON!]!
        summary: DataHubValidationSummary!
    }

    "Summary of load simulation"
    type DataHubLoadSummary {
        recordCount: Int!
        adapterCode: String!
    }
`;

export const testQueries = ``;

export const testMutations = `
    extend type Mutation {
        "Preview extract step - runs extractor and returns sample records"
        previewDataHubExtract(step: JSON!, limit: Int = 20): DataHubPreviewResult!

        """
        Simulate transform step - applies transforms to input records.
        The step argument expects a JSON object with shape:
        { config: { operators: [{ op: string, args: Record<string, any> }] } }
        """
        simulateDataHubTransform(step: JSON!, records: JSON!): [JSON!]!

        "Simulate validate step - runs validation rules on input records"
        simulateDataHubValidate(step: JSON!, records: JSON!): DataHubValidateResult!

        "Simulate load step - checks what would be created/updated without writing"
        simulateDataHubLoad(step: JSON!, records: JSON!): JSON!
    }
`;

