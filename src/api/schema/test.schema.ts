/**
 * Test helpers schema for node-level step testing
 *
 * Provides mutations for testing individual pipeline steps:
 * - Extract: Run extractor and preview records
 * - Transform: Apply transforms to sample data
 * - Validate: Run validation rules on sample data
 * - Load: Simulate loader without database writes
 */
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

        "Simulate transform step - applies transforms to input records"
        simulateDataHubTransform(step: JSON!, records: JSON!): [JSON!]!

        "Simulate validate step - runs validation rules on input records"
        simulateDataHubValidate(step: JSON!, records: JSON!): DataHubValidateResult!

        "Simulate load step - checks what would be created/updated without writing"
        simulateDataHubLoad(step: JSON!, records: JSON!): JSON!
    }
`;

