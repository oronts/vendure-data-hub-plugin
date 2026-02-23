export const configOptionsSchema = `
    type DataHubOptionValue {
        value: String!
        label: String!
        description: String
        "Lucide icon name (kebab-case) for UI display"
        icon: String
        "Hex color code for UI display (e.g. #3b82f6)"
        color: String
        "Optional category for UI grouping (e.g. Catalog, Orders)"
        category: String
    }

    type DataHubTypedOptionValue {
        value: String!
        label: String!
        description: String
        "Lucide icon name (kebab-case) for UI display"
        icon: String
        "Optional category for UI grouping"
        category: String
        "Form field definitions for this option type"
        fields: [DataHubConnectionSchemaField!]!
        "Default values when creating a new entry of this type (JSON object)"
        defaultValues: JSON
        "Key map for converting wizard field names to pipeline config keys (JSON object)"
        configKeyMap: JSON
        "Which wizard scopes this option appears in (e.g. import, export)"
        wizardScopes: [String!]
    }

    type DataHubComparisonOperator {
        value: String!
        label: String!
        description: String
        valueType: String
        noValue: Boolean
        "Example value hint (e.g. regex pattern, JSON array literal)"
        example: String
    }

    type DataHubAdapterCodeMapping {
        value: String!
        label: String!
        adapterCode: String!
    }

    type DataHubConnectionSchemaField {
        key: String!
        label: String!
        type: String!
        required: Boolean
        placeholder: String
        defaultValue: JSON
        description: String
        options: [DataHubOption!]
        "Reference to a dynamic option list served by configOptions (e.g. authTypes, queueTypes, vendureEvents)"
        optionsRef: String
    }

    type DataHubConnectionSchema {
        type: String!
        label: String!
        fields: [DataHubConnectionSchemaField!]!
        "True for HTTP-like connection types that use the dedicated HTTP editor with auth/headers support"
        httpLike: Boolean
    }

    type DataHubDestinationSchema {
        "Destination type key (e.g. SFTP, S3, HTTP)"
        type: String!
        "Human-readable label"
        label: String!
        "Key in the wizard destination state object (e.g. sftpConfig, s3Config)"
        configKey: String!
        "Informational message for destination types with no configurable fields"
        message: String
        "Field definitions for the destination configuration form"
        fields: [DataHubConnectionSchemaField!]!
        "Maps wizard field names to pipeline config field names (JSON object, e.g. { directory: path })"
        fieldMapping: JSON
    }

    type DataHubStepTypeConfig {
        "Step type identifier (e.g. TRIGGER, EXTRACT, TRANSFORM)"
        type: String!
        "Human-readable label"
        label: String!
        "Description of what this step type does"
        description: String!
        "Lucide icon name (PascalCase) for UI display"
        icon: String!
        "Primary color hex code"
        color: String!
        "Background color hex code"
        bgColor: String!
        "Border color hex code"
        borderColor: String!
        "Number of input handles"
        inputs: Int!
        "Number of output handles"
        outputs: Int!
        "Step category for grouping (e.g. source, transform, load)"
        category: String!
        "Backend adapter type for registry lookup (e.g. EXTRACTOR, OPERATOR, LOADER). Null for step types without adapters."
        adapterType: String
        "Visual node type for the pipeline editor (e.g. source, transform, load)"
        nodeType: String!
    }

    type DataHubHookStage {
        "Hook stage key (e.g. PIPELINE_STARTED, BEFORE_EXTRACT)"
        key: String!
        "Human-readable label"
        label: String!
        "Description of when this hook stage fires"
        description: String!
        "Lucide icon name (kebab-case) for UI display"
        icon: String!
        "Category for grouping (lifecycle, data, error)"
        category: String!
    }

    type DataHubHookStageCategory {
        "Category key (e.g. lifecycle, data, error)"
        key: String!
        "Human-readable label"
        label: String!
        "CSS color classes for the category badge"
        color: String!
        "Description of this category"
        description: String!
        "CSS grid class for layout (e.g. grid-cols-3)"
        gridClass: String!
        "Display order (lower = first)"
        order: Int!
    }

    type DataHubWizardStrategyMapping {
        "Wizard-internal value for existing records strategy (e.g. SKIP, UPDATE, REPLACE, ERROR)"
        wizardValue: String!
        "Human-readable label"
        label: String!
        "Backend LoadStrategy to use (e.g. CREATE, UPSERT)"
        loadStrategy: String!
        "Backend ConflictStrategy to use (e.g. SOURCE_WINS, MERGE)"
        conflictStrategy: String!
    }

    type DataHubConfigOptions {
        stepTypes: [DataHubStepTypeConfig!]!
        loadStrategies: [DataHubOptionValue!]!
        conflictStrategies: [DataHubOptionValue!]!
        triggerTypes: [DataHubTypedOptionValue!]!
        fileEncodings: [DataHubOptionValue!]!
        csvDelimiters: [DataHubOptionValue!]!
        compressionTypes: [DataHubOptionValue!]!
        httpMethods: [DataHubOptionValue!]!
        authTypes: [DataHubOptionValue!]!
        destinationTypes: [DataHubOptionValue!]!
        fileFormats: [DataHubOptionValue!]!
        cleanupStrategies: [DataHubOptionValue!]!
        newRecordStrategies: [DataHubOptionValue!]!
        validationModes: [DataHubOptionValue!]!
        queueTypes: [DataHubOptionValue!]!
        vendureEvents: [DataHubOptionValue!]!
        comparisonOperators: [DataHubComparisonOperator!]!
        approvalTypes: [DataHubTypedOptionValue!]!
        backoffStrategies: [DataHubOptionValue!]!
        enrichmentSourceTypes: [DataHubTypedOptionValue!]!
        validationRuleTypes: [DataHubTypedOptionValue!]!
        exportAdapterCodes: [DataHubAdapterCodeMapping!]!
        feedAdapterCodes: [DataHubAdapterCodeMapping!]!
        connectionSchemas: [DataHubConnectionSchema!]!
        destinationSchemas: [DataHubDestinationSchema!]!
        hookStages: [DataHubHookStage!]!
        hookStageCategories: [DataHubHookStageCategory!]!
        logLevels: [DataHubOptionValue!]!
        runModes: [DataHubOptionValue!]!
        checkpointStrategies: [DataHubOptionValue!]!
        parallelErrorPolicies: [DataHubOptionValue!]!
        logPersistenceLevels: [DataHubOptionValue!]!
        "Adapter type metadata for the adapters page tabs"
        adapterTypes: [DataHubOptionValue!]!
        "Run status options for filter dropdowns"
        runStatuses: [DataHubOptionValue!]!
        "Operator codes suitable for field-level transforms in the export wizard"
        fieldTransformTypes: [DataHubOptionValue!]!
        "Wizard strategy mappings: existingRecords wizard value to backend load/conflict strategies"
        wizardStrategyMappings: [DataHubWizardStrategyMapping!]!
        "Export query type options for the source step"
        queryTypeOptions: [DataHubOptionValue!]!
        "Cron schedule presets for quick schedule trigger configuration"
        cronPresets: [DataHubOptionValue!]!
        "Message acknowledgment mode options for queue consumers"
        ackModes: [DataHubOptionValue!]!
    }
`;

export const configOptionsQueries = `
    extend type Query {
        """
        Returns all enum/option values used by the frontend for dropdowns and selections.
        """
        dataHubConfigOptions: DataHubConfigOptions!
    }
`;
