/**
 * Loader Entity Field Schema GraphQL definitions
 *
 * Exposes EntityFieldSchema from LoaderRegistry via GraphQL for:
 * - Pipeline UI field mapping
 * - Import wizard target field selection
 * - Auto-mapper suggestions
 */

export const entitySchemaSchema = `
    """
    Supported field types for loader entity schemas
    """
    enum DataHubLoaderFieldType {
        string
        number
        boolean
        date
        array
        object
        relation
        asset
        money
        localized_string
        id
        enum
        json
    }

    """
    Validation rules for a loader entity field
    """
    type DataHubLoaderFieldValidation {
        minLength: Int
        maxLength: Int
        min: Float
        max: Float
        pattern: String
        enum: [JSON]
    }

    """
    Definition of a single field within a loader entity schema
    """
    type DataHubLoaderField {
        "Field key/path"
        key: String!
        "Human-readable label"
        label: String!
        "Field type"
        type: DataHubLoaderFieldType!
        "Is this field required?"
        required: Boolean
        "Is this field read-only?"
        readonly: Boolean
        "Can be used for lookup?"
        lookupable: Boolean
        "Is this field translatable?"
        translatable: Boolean
        "Related entity type (for relations)"
        relatedEntity: String
        "Nested fields (for objects)"
        children: [DataHubLoaderField!]
        "Description/help text"
        description: String
        "Example value"
        example: JSON
        "Validation rules"
        validation: DataHubLoaderFieldValidation
    }

    """
    Schema definition for a Vendure entity type from LoaderRegistry
    """
    type DataHubLoaderEntitySchema {
        "Entity type (e.g., Product, ProductVariant, Customer)"
        entityType: String!
        "List of available fields for this entity"
        fields: [DataHubLoaderField!]!
    }

    """
    Summary of a supported entity type
    """
    type DataHubSupportedEntity {
        "Entity type code"
        code: String!
        "Human-readable name"
        name: String!
        "Description of the entity"
        description: String
        "Supported operations (create, update, upsert, delete)"
        supportedOperations: [String!]!
    }
`;

export const entitySchemaQueries = `
    extend type Query {
        """
        Get the field schema for a specific entity type.
        Returns the available fields for mapping data to this entity.
        """
        dataHubLoaderEntitySchema(entityType: String!): DataHubLoaderEntitySchema

        """
        Get field schemas for all registered entity types.
        Useful for populating dropdowns and showing all available targets.
        """
        dataHubLoaderEntitySchemas: [DataHubLoaderEntitySchema!]!

        """
        List all supported entity types with their operations.
        Use this to show available entity types in the UI.
        """
        dataHubSupportedEntities: [DataHubSupportedEntity!]!
    }
`;
