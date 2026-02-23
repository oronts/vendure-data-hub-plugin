export const adapterSchema = `
    type DataHubAdapter {
        type: String!
        code: String!
        name: String
        description: String
        category: String
        schema: DataHubStepConfigSchema!
        pure: Boolean
        async: Boolean
        batchable: Boolean
        requires: [String!]
        icon: String
        color: String
        version: String
        deprecated: Boolean
        deprecatedMessage: String
        entityType: String
        formatType: String
        patchableFields: [String!]
        editorType: String
        summaryTemplate: String
        categoryLabel: String
        categoryOrder: Int
        wizardHidden: Boolean
        builtIn: Boolean
    }

    type DataHubStepConfigSchema {
        fields: [DataHubStepConfigSchemaField!]!
        groups: [DataHubConfigFieldGroup!]
    }

    type DataHubStepConfigSchemaField {
        key: String!
        label: String
        description: String
        type: String!
        required: Boolean
        defaultValue: JSON
        placeholder: String
        options: [DataHubOption!]
        group: String
        dependsOn: DataHubFieldDependency
        validation: DataHubFieldValidation
    }

    type DataHubFieldValidation {
        min: Float
        max: Float
        minLength: Int
        maxLength: Int
        pattern: String
        patternMessage: String
    }

    type DataHubConfigFieldGroup {
        id: String!
        label: String!
        description: String
    }

    type DataHubOption {
        value: String!
        label: String!
    }

    """
    Extractor API - List and inspect data extractors
    """
    enum DataHubExtractorCategory {
        DATA_SOURCE
        FILE_SYSTEM
        CLOUD_STORAGE
        DATABASE
        API
        WEBHOOK
        VENDURE
        CUSTOM
    }

    type DataHubExtractor {
        code: String!
        name: String!
        description: String
        category: DataHubExtractorCategory!
        version: String
        icon: String
        supportsPagination: Boolean!
        supportsIncremental: Boolean!
        supportsCancellation: Boolean!
        isStreaming: Boolean!
        isBatch: Boolean!
        schema: DataHubExtractorConfigSchema!
    }

    type DataHubExtractorConfigSchema {
        fields: [DataHubExtractorConfigField!]!
        groups: [DataHubExtractorConfigGroup!]
    }

    type DataHubExtractorConfigField {
        key: String!
        label: String!
        description: String
        type: String!
        required: Boolean
        defaultValue: JSON
        placeholder: String
        options: [DataHubOption!]
        group: String
        dependsOn: DataHubFieldDependency
    }

    type DataHubFieldDependency {
        field: String!
        value: JSON!
        operator: String
    }

    type DataHubExtractorConfigGroup {
        id: String!
        label: String!
        description: String
    }

    type DataHubExtractorsByCategory {
        category: DataHubExtractorCategory!
        label: String!
        extractors: [DataHubExtractor!]!
    }
`;

export const adapterQueries = `
    extend type Query {
        dataHubAdapters: [DataHubAdapter!]!
        """
        List all registered extractors
        """
        dataHubExtractors: [DataHubExtractor!]!

        """
        Get extractors grouped by category for UI display
        """
        dataHubExtractorsByCategory: [DataHubExtractorsByCategory!]!

        """
        Get a specific extractor by code
        """
        dataHubExtractor(code: String!): DataHubExtractor

        """
        Get the configuration schema for a specific extractor
        """
        dataHubExtractorSchema(code: String!): DataHubExtractorConfigSchema
    }
`;
